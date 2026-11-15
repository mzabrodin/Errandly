import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Clock } from '../common/clock.js';
import { DEFAULT_EMAIL_REMINDER_MINUTES, type ReminderKind } from '../common/domain.js';
import { EventBus } from '../common/events/event-bus.js';
import { ExclusiveRunner } from '../common/exclusive-runner.js';
import { addMs, DAY_MS } from '../common/time.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DATABASE, type Database } from '../db/database.js';
import { TasksApi, type TaskView } from '../tasks/index.js';
import { UsersApi } from '../users/index.js';
import { NotificationFeed } from './notification-feed.js';
import { NotificationsRepository } from './notifications.repository.js';
import { digestWeek, isDueSoon } from './notifications.rules.js';

// The longest reminder setting
const DUE_SOON_WINDOW_MS = DAY_MS;
// A first run after a long pause doesn't dig up old history
const OVERDUE_LOOKBACK_MS = 2 * DAY_MS;

/** FR-25, FR-38; also at start-up, so runs missed while the server was down catch up (SYS-25) */
@Injectable()
export class ReminderJobs implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(ReminderJobs.name);
  private readonly runner = new ExclusiveRunner(this.logger, 'Reminders');
  private readonly enabled: boolean;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: NotificationsRepository,
    private readonly feed: NotificationFeed,
    private readonly tasks: TasksApi,
    private readonly users: UsersApi,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.enabled = config.get('SCHEDULER_ENABLED', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (this.enabled) void this.tick();
  }

  /** Before the pool closes; later cron ticks do nothing */
  beforeApplicationShutdown(): Promise<void> {
    return this.runner.stop();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  tick(): Promise<void> {
    return this.enabled ? this.runner.run(() => this.run()) : Promise.resolve();
  }

  async run(): Promise<void> {
    await this.dueSoon();
    await this.overdue();
    await this.digests();
  }

  async dueSoon(): Promise<number> {
    const now = this.clock.now();
    const tasks = await this.tasks.openAssignedDueBetween(now, addMs(now, DUE_SOON_WINDOW_MS));
    const minutes = await this.repository.emailReminderMinutesOfMany([
      ...new Set(tasks.flatMap((task) => (task.assigneeId === null ? [] : [task.assigneeId]))),
    ]);
    const due = tasks.filter((task) =>
      isDueSoon(
        task.dueAt,
        minutes.get(task.assigneeId ?? '') ?? DEFAULT_EMAIL_REMINDER_MINUTES,
        now,
      ),
    );
    return this.record(due, 'dueSoon');
  }

  async overdue(): Promise<number> {
    const now = this.clock.now();
    const tasks = await this.tasks.openAssignedDueBetween(addMs(now, -OVERDUE_LOOKBACK_MS), now);
    return this.record(tasks, 'overdue');
  }

  async digests(): Promise<number> {
    const now = this.clock.now();
    const users = await this.users.findMany(await this.repository.usersWithEmail('weeklyDigest'));
    let queued = 0;
    for (const user of users.values()) {
      const week = digestWeek(now, user.timezone);
      if (!week) continue;
      // oxlint-disable-next-line no-await-in-loop -- one user at a time keeps the transactions short
      queued += await this.db.transaction(async (tx) => {
        if (!(await this.repository.recordDigest(user.id, week.weekStart, tx))) return 0;
        await this.bus.publish(tx, 'notification.digestDue', {
          userId: user.id,
          lastWeekFrom: week.lastWeekFrom.toISOString(),
          lastWeekTo: week.lastWeekTo.toISOString(),
          until: week.until.toISOString(),
        });
        return 1;
      });
    }
    return queued;
  }

  private async record(tasks: readonly TaskView[], kind: ReminderKind): Promise<number> {
    let recorded = 0;
    for (const task of tasks) {
      const userId = task.assigneeId;
      if (userId === null) continue;
      // oxlint-disable-next-line no-await-in-loop -- one task at a time keeps the transactions short
      recorded += await this.db.transaction(async (tx) => {
        const fresh = await this.repository.recordReminder(
          { taskId: task.id, userId, kind, dueAt: task.dueAt },
          tx,
        );
        if (!fresh) return 0;
        if (kind === 'overdue') {
          await this.feed.notify(
            [{ userId, type: 'taskOverdue' }],
            { groupId: task.groupId, taskId: task.id },
            tx,
          );
        }
        await this.bus.publish(tx, 'notification.reminderDue', { taskId: task.id, userId, kind });
        return 1;
      });
    }
    return recorded;
  }
}
