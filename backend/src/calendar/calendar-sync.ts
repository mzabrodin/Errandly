import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Clock } from '../common/clock.js';
import { TokenCipher } from '../common/crypto/token-cipher.js';
import { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { TasksApi, type TaskView } from '../tasks/index.js';
import { UsersApi } from '../users/index.js';
import { CalendarRepository } from './calendar.repository.js';
import { eventIdFor, planSync, toCalendarEvent } from './calendar.rules.js';
import type { CalendarConnectionRow } from './calendar.schema.js';
import { CalendarAccessRevoked, type CalendarAccess } from './gateways/calendar-gateway.js';
import { CalendarGateways } from './gateways/calendar-gateways.js';

class ConnectionFailure extends Error {
  constructor(
    readonly connection: CalendarConnectionRow,
    override readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/** Reconciles from the current state, so retries and out-of-order events end the same (SYS-20) */
@Injectable()
export class CalendarSync implements OnModuleInit {
  private readonly logger = new Logger(CalendarSync.name);
  private readonly appUrl: string;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: CalendarRepository,
    private readonly tasks: TasksApi,
    private readonly users: UsersApi,
    private readonly gateways: CalendarGateways,
    private readonly cipher: TokenCipher,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  onModuleInit(): void {
    this.bus.onAfterCommit('task.assigned', 'calendar.syncAssignedTask', ({ taskId }) =>
      this.syncTask(taskId),
    );
    this.bus.onAfterCommit('task.changed', 'calendar.syncChangedTask', ({ taskId }) =>
      this.syncTask(taskId),
    );
    this.bus.onAfterCommit('task.completed', 'calendar.syncCompletedTask', ({ taskId }) =>
      this.syncTask(taskId),
    );
    this.bus.onInTransaction('task.deleted', ({ taskId }, tx) => this.discardEvents(taskId, tx));
    this.bus.onAfterCommit('calendar.eventDiscarded', 'calendar.deleteEvent', (event) =>
      this.deleteEvent(event.connectionId, event.externalEventId),
    );
    this.bus.onAfterCommit('calendar.resyncRequested', 'calendar.resync', ({ userId }) =>
      this.resync(userId),
    );
  }

  // The task is held and the link written before Google is called, so a concurrent delete sees it
  async syncTask(taskId: string): Promise<void> {
    await this.guard(() =>
      this.db.transaction(async (tx) => {
        const task = await this.tasks.hold(taskId, tx);
        if (!task) return;
        const target =
          task.assigneeId === null
            ? undefined
            : await this.repository.findByUser(task.assigneeId, tx);
        const plan = planSync(
          await this.repository.linksOfTask(taskId, tx),
          target ? { id: target.id, paused: target.syncStatus === 'paused' } : null,
        );
        for (const link of plan.remove) {
          // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the calls run in order anyway
          await this.removeLink(link.connectionId, link.externalEventId, taskId, tx);
        }
        if (target && plan.upsertOn === target.id) await this.upsert(task, target, tx);
      }),
    );
  }

  async discardEvents(taskId: string, tx: DbExecutor): Promise<void> {
    for (const link of await this.repository.linksOfTask(taskId, tx)) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the inserts run in order anyway
      await this.bus.publish(tx, 'calendar.eventDiscarded', {
        connectionId: link.connectionId,
        externalEventId: link.externalEventId,
      });
    }
  }

  async deleteEvent(connectionId: string, externalEventId: string): Promise<void> {
    const connection = await this.repository.findById(connectionId);
    // A closed connection took its whole calendar with it
    if (!connection || connection.syncStatus === 'paused') return;
    await this.guard(async () => {
      await this.call(connection, (access, gateway) =>
        gateway.deleteEvent(access, externalEventId),
      );
      await this.repository.markSynced(connection.id, this.clock.now());
    });
  }

  async resync(userId: string): Promise<void> {
    const connection = await this.repository.findByUser(userId);
    if (!connection || connection.syncStatus === 'paused') return;
    const upcoming = await this.tasks.assignedTo(userId, this.clock.now());
    const linked = await this.repository.linksOfConnection(connection.id);
    const taskIds = new Set([...upcoming.map((task) => task.id), ...linked.map((l) => l.taskId)]);
    for (const taskId of taskIds) {
      // oxlint-disable-next-line no-await-in-loop -- one task at a time keeps within the API quota
      await this.syncTask(taskId);
    }
    const current = await this.repository.findById(connection.id);
    if (!current || current.syncStatus === 'paused') return;
    await this.guard(async () => {
      const remote = await this.call(current, (access, gateway) => gateway.listEventIds(access));
      // Every event in this calendar is Errandly's, so unlinked ones are leftovers (FR-36)
      const known = new Set(
        (await this.repository.linksOfConnection(current.id)).map((link) => link.externalEventId),
      );
      for (const eventId of remote.filter((id) => !known.has(id))) {
        // oxlint-disable-next-line no-await-in-loop -- one event at a time keeps within the API quota
        await this.call(current, (access, gateway) => gateway.deleteEvent(access, eventId));
      }
      await this.repository.markSynced(current.id, this.clock.now());
    });
  }

  private async removeLink(
    connectionId: string,
    externalEventId: string,
    taskId: string,
    tx: DbExecutor,
  ): Promise<void> {
    const connection = await this.repository.findById(connectionId, tx);
    if (!connection || connection.syncStatus === 'paused') return;
    await this.call(connection, (access, gateway) => gateway.deleteEvent(access, externalEventId));
    await this.repository.deleteLink(connectionId, taskId, tx);
    await this.repository.markSynced(connectionId, this.clock.now(), tx);
  }

  private async upsert(
    task: TaskView,
    connection: CalendarConnectionRow,
    tx: DbExecutor,
  ): Promise<void> {
    const assignee = await this.users.findById(connection.userId, tx);
    if (!assignee) return;
    const eventId = eventIdFor(task.id);
    const now = this.clock.now();
    await this.repository.saveLink(
      { connectionId: connection.id, taskId: task.id, externalEventId: eventId },
      now,
      tx,
    );
    const event = toCalendarEvent(task, {
      timeZone: assignee.timezone,
      reminderMinutes: await this.repository.reminderMinutesOf(connection.userId, tx),
      appUrl: this.appUrl,
    });
    await this.call(connection, (access, gateway) => gateway.upsertEvent(access, eventId, event));
    await this.repository.markSynced(connection.id, now, tx);
  }

  private async call<T>(
    connection: CalendarConnectionRow,
    work: (access: CalendarAccess, gateway: ReturnType<CalendarGateways['for']>) => Promise<T>,
  ): Promise<T> {
    const access = {
      calendarId: connection.calendarId,
      refreshToken: this.cipher.decrypt(connection.refreshTokenEncrypted),
    };
    try {
      return await work(access, this.gateways.for(connection.provider));
    } catch (error) {
      throw new ConnectionFailure(connection, error);
    }
  }

  /** Revoked access pauses at once; any other failure is counted and retried by the dispatcher */
  private async guard(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof ConnectionFailure)) throw error;
      const { connection, cause } = error;
      if (cause instanceof CalendarAccessRevoked) {
        this.logger.warn(`Calendar access revoked for connection ${connection.id}; sync paused`);
        await this.repository.pause(connection.id, cause.message);
        return;
      }
      await this.repository.recordFailure(connection.id, error.message);
      throw cause;
    }
  }
}
