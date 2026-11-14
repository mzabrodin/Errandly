import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { DEFAULT_CALENDAR_REMINDER_MINUTES, type CalendarProvider } from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { FAILURES_BEFORE_PAUSE } from './calendar.rules.js';
import {
  calendarConnections,
  calendarEventLinks,
  calendarSettings,
  type CalendarConnectionRow,
  type CalendarEventLinkRow,
} from './calendar.schema.js';

export interface NewConnection {
  userId: string;
  provider: CalendarProvider;
  accountEmail: string;
  refreshTokenEncrypted: string;
  calendarId: string;
}

@Injectable()
export class CalendarRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByUser(
    userId: string,
    db: DbExecutor = this.db,
  ): Promise<CalendarConnectionRow | undefined> {
    const [row] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, userId))
      .limit(1);
    return row;
  }

  async findById(id: string, db: DbExecutor = this.db): Promise<CalendarConnectionRow | undefined> {
    const [row] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.id, id))
      .limit(1);
    return row;
  }

  async save(values: NewConnection, now: Date, db: DbExecutor = this.db): Promise<void> {
    const fresh = {
      accountEmail: values.accountEmail,
      refreshTokenEncrypted: values.refreshTokenEncrypted,
      calendarId: values.calendarId,
      syncStatus: 'ok' as const,
      failedAttempts: 0,
      lastError: null,
      updatedAt: now,
    };
    await db
      .insert(calendarConnections)
      .values({ ...values, ...fresh })
      .onConflictDoUpdate({
        target: [calendarConnections.userId, calendarConnections.provider],
        set: fresh,
      });
  }

  async delete(id: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(calendarConnections).where(eq(calendarConnections.id, id));
  }

  async resume(id: string, now: Date, db: DbExecutor = this.db): Promise<void> {
    await db
      .update(calendarConnections)
      .set({ syncStatus: 'ok', failedAttempts: 0, lastError: null, updatedAt: now })
      .where(eq(calendarConnections.id, id));
  }

  async reminderMinutesOf(userId: string, db: DbExecutor = this.db): Promise<number> {
    const [row] = await db
      .select({ reminderMinutes: calendarSettings.reminderMinutes })
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);
    return row?.reminderMinutes ?? DEFAULT_CALENDAR_REMINDER_MINUTES;
  }

  async saveReminderMinutes(
    userId: string,
    minutes: number,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .insert(calendarSettings)
      .values({ userId, reminderMinutes: minutes, updatedAt: now })
      .onConflictDoUpdate({
        target: calendarSettings.userId,
        set: { reminderMinutes: minutes, updatedAt: now },
      });
  }

  async markSynced(id: string, now: Date, db: DbExecutor = this.db): Promise<void> {
    await db
      .update(calendarConnections)
      .set({ failedAttempts: 0, lastError: null, lastSyncedAt: now })
      .where(eq(calendarConnections.id, id));
  }

  async recordFailure(id: string, error: string, db: DbExecutor = this.db): Promise<void> {
    const attempts = sql`${calendarConnections.failedAttempts} + 1`;
    await db
      .update(calendarConnections)
      .set({
        failedAttempts: attempts,
        lastError: error,
        syncStatus: sql`CASE WHEN ${attempts} >= ${FAILURES_BEFORE_PAUSE} THEN 'paused'::sync_status ELSE ${calendarConnections.syncStatus} END`,
      })
      .where(eq(calendarConnections.id, id));
  }

  async pause(id: string, error: string, db: DbExecutor = this.db): Promise<void> {
    await db
      .update(calendarConnections)
      .set({ syncStatus: 'paused', lastError: error })
      .where(eq(calendarConnections.id, id));
  }

  linksOfTask(taskId: string, db: DbExecutor = this.db): Promise<CalendarEventLinkRow[]> {
    return db.select().from(calendarEventLinks).where(eq(calendarEventLinks.taskId, taskId));
  }

  linksOfConnection(
    connectionId: string,
    db: DbExecutor = this.db,
  ): Promise<CalendarEventLinkRow[]> {
    return db
      .select()
      .from(calendarEventLinks)
      .where(eq(calendarEventLinks.connectionId, connectionId));
  }

  async saveLink(
    link: Omit<CalendarEventLinkRow, 'syncedAt'>,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .insert(calendarEventLinks)
      .values({ ...link, syncedAt: now })
      .onConflictDoUpdate({
        target: [calendarEventLinks.connectionId, calendarEventLinks.taskId],
        set: { externalEventId: link.externalEventId, syncedAt: now },
      });
  }

  async deleteLink(connectionId: string, taskId: string, db: DbExecutor = this.db): Promise<void> {
    await db
      .delete(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.connectionId, connectionId),
          eq(calendarEventLinks.taskId, taskId),
        ),
      );
  }
}
