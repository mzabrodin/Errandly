import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Clock } from '../common/clock.js';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationEvent } from '../common/domain.js';
import type { DomainEventMap } from '../common/events/domain-events.js';
import { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { appLink } from '../config/urls.js';
import { GroupsApi } from '../groups/index.js';
import { MailService, type MailData } from '../mail/index.js';
import { TasksApi, type TaskView } from '../tasks/index.js';
import { UsersApi, type UserDto } from '../users/index.js';
import { NotificationsRepository } from './notifications.repository.js';
import { firstName, reminderMinutesOption, summarizeWeek } from './notifications.rules.js';

const MAX_DIGEST_TASKS = 50;

interface TaskMail {
  user: UserDto;
  data: MailData<'taskOverdue'>;
}

@Injectable()
export class NotificationEmails implements OnModuleInit {
  private readonly appUrl: string;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly tasks: TasksApi,
    private readonly groups: GroupsApi,
    private readonly users: UsersApi,
    private readonly mail: MailService,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  onModuleInit(): void {
    this.bus.onAfterCommit('task.assigned', 'notifications.sendAssignedEmail', (event) =>
      this.assigned(event),
    );
    this.bus.onAfterCommit('notification.reminderDue', 'notifications.sendReminderEmail', (event) =>
      this.reminder(event),
    );
    this.bus.onAfterCommit('notification.digestDue', 'notifications.sendWeeklyDigest', (event) =>
      this.digest(event),
    );
  }

  async assigned({
    taskId,
    assigneeId,
    actorId,
    bulk,
  }: DomainEventMap['task.assigned']): Promise<void> {
    if (bulk || assigneeId === null || assigneeId === actorId) return;
    const mail = await this.taskMail(taskId, assigneeId, 'taskAssigned');
    if (!mail) return;
    const actor = actorId === null ? null : await this.users.findById(actorId);
    await this.mail.send(
      'taskAssigned',
      mail.user.email,
      { ...mail.data, ...(actor && { actorName: actor.name }) },
      mail.user.locale,
    );
  }

  async reminder({
    taskId,
    userId,
    kind,
  }: DomainEventMap['notification.reminderDue']): Promise<void> {
    const mail = await this.taskMail(
      taskId,
      userId,
      kind === 'dueSoon' ? 'taskDueSoon' : 'taskOverdue',
    );
    if (!mail) return;
    if (kind === 'overdue') {
      await this.mail.send('taskOverdue', mail.user.email, mail.data, mail.user.locale);
      return;
    }
    const minutes = await this.repository.emailReminderMinutesOf(userId);
    await this.mail.send(
      'taskDueSoon',
      mail.user.email,
      { ...mail.data, reminderMinutes: reminderMinutesOption(minutes) },
      mail.user.locale,
    );
  }

  async digest(event: DomainEventMap['notification.digestDue']): Promise<void> {
    if (!(await this.emailOn(event.userId, 'weeklyDigest'))) return;
    const user = await this.users.findById(event.userId);
    if (!user) return;
    const until = new Date(event.until);
    const week = {
      lastWeekFrom: new Date(event.lastWeekFrom),
      lastWeekTo: new Date(event.lastWeekTo),
      until,
    };
    const tasks = await this.tasks.assignedTo(user.id, week.lastWeekFrom, until);
    const summary = summarizeWeek(tasks, week, this.clock.now());
    const names = await this.groups.names(summary.map((group) => group.groupId));
    const groups = summary.flatMap((group) => {
      const name = names.get(group.groupId);
      if (name === undefined) return [];
      const upcoming = group.upcoming.slice(0, MAX_DIGEST_TASKS).map((task) => ({
        title: task.title,
        dueAt: task.dueAt.toISOString(),
        difficulty: task.difficulty,
        url: this.taskUrl(task),
      }));
      return [{ name, done: group.done, overdue: group.overdue, tasks: upcoming }];
    });
    if (groups.length === 0) return;
    await this.mail.send(
      'weeklyDigest',
      user.email,
      {
        name: firstName(user.name),
        url: appLink(this.appUrl, '/'),
        settingsUrl: appLink(this.appUrl, '/settings'),
        timezone: user.timezone,
        groups,
      },
      user.locale,
    );
  }

  private async taskMail(
    taskId: string,
    userId: string,
    event: NotificationEvent,
  ): Promise<TaskMail | null> {
    const task = await this.tasks.find(taskId);
    // Reassigned, done or deleted since the event: the email would be stale
    if (!task || task.assigneeId !== userId || task.completedAt !== null) return null;
    if (!(await this.emailOn(userId, event))) return null;
    const [user, names] = await Promise.all([
      this.users.findById(userId),
      this.groups.names([task.groupId]),
    ]);
    const groupName = names.get(task.groupId);
    if (!user || groupName === undefined) return null;
    return {
      user,
      data: {
        name: firstName(user.name),
        groupName,
        taskTitle: task.title,
        dueAt: task.dueAt.toISOString(),
        difficulty: task.difficulty,
        url: this.taskUrl(task),
        settingsUrl: appLink(this.appUrl, '/settings'),
        timezone: user.timezone,
      },
    };
  }

  private async emailOn(userId: string, event: NotificationEvent): Promise<boolean> {
    return (
      (await this.repository.emailEnabled(userId, event)) ?? DEFAULT_NOTIFICATION_PREFERENCES[event]
    );
  }

  private taskUrl(task: TaskView): string {
    return appLink(this.appUrl, `/g/${task.groupId}/tasks/${task.id}`);
  }
}
