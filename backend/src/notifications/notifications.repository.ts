import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  DEFAULT_EMAIL_REMINDER_MINUTES,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationType,
  type ReminderKind,
} from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import type { PurgeCutoffs } from './notifications.rules.js';
import {
  notificationPreferences,
  notifications,
  notificationSettings,
  taskReminders,
  weeklyDigests,
  type NewNotificationRow,
  type NotificationRow,
} from './notifications.schema.js';

export interface PreferenceOverride {
  event: NotificationEvent;
  channel: NotificationChannel;
  enabled: boolean;
}

function preferenceKey(
  userId: string,
  event: NotificationEvent,
  channel: NotificationChannel,
): SQL | undefined {
  return and(
    eq(notificationPreferences.userId, userId),
    eq(notificationPreferences.event, event),
    eq(notificationPreferences.channel, channel),
  );
}

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async emailReminderMinutesOf(userId: string, db: DbExecutor = this.db): Promise<number> {
    const [row] = await db
      .select({ reminderMinutes: notificationSettings.reminderMinutes })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1);
    return row?.reminderMinutes ?? DEFAULT_EMAIL_REMINDER_MINUTES;
  }

  async saveEmailReminderMinutes(
    userId: string,
    minutes: number,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .insert(notificationSettings)
      .values({ userId, reminderMinutes: minutes, updatedAt: now })
      .onConflictDoUpdate({
        target: notificationSettings.userId,
        set: { reminderMinutes: minutes, updatedAt: now },
      });
  }

  preferencesOf(userId: string, db: DbExecutor = this.db): Promise<PreferenceOverride[]> {
    return db
      .select({
        event: notificationPreferences.event,
        channel: notificationPreferences.channel,
        enabled: notificationPreferences.enabled,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
  }

  async savePreference(
    userId: string,
    override: PreferenceOverride,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .insert(notificationPreferences)
      .values({ userId, ...override, updatedAt: now })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.event,
          notificationPreferences.channel,
        ],
        set: { enabled: override.enabled, updatedAt: now },
      });
  }

  async deletePreference(
    userId: string,
    event: NotificationEvent,
    channel: NotificationChannel,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db.delete(notificationPreferences).where(preferenceKey(userId, event, channel));
  }

  async insert(rows: NewNotificationRow[], db: DbExecutor = this.db): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(notifications).values(rows);
  }

  latest(userId: string, limit: number, db: DbExecutor = this.db): Promise<NotificationRow[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
  }

  async markRead(
    userId: string,
    ids: readonly string[] | undefined,
    at: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          ids === undefined ? undefined : inArray(notifications.id, [...ids]),
        ),
      );
  }

  async hasUnread(
    userId: string,
    type: NotificationType,
    groupId: string,
    taskTitle: string,
    db: DbExecutor = this.db,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, type),
          eq(notifications.groupId, groupId),
          isNull(notifications.readAt),
          sql`${notifications.data}->>'taskTitle' = ${taskTitle}`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async emailReminderMinutesOfMany(
    userIds: readonly string[],
    db: DbExecutor = this.db,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({
        userId: notificationSettings.userId,
        minutes: notificationSettings.reminderMinutes,
      })
      .from(notificationSettings)
      .where(inArray(notificationSettings.userId, [...userIds]));
    return new Map(rows.map((row) => [row.userId, row.minutes]));
  }

  async emailEnabled(
    userId: string,
    event: NotificationEvent,
    db: DbExecutor = this.db,
  ): Promise<boolean | undefined> {
    const [row] = await db
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(preferenceKey(userId, event, 'email'))
      .limit(1);
    return row?.enabled;
  }

  async usersWithEmail(event: NotificationEvent, db: DbExecutor = this.db): Promise<string[]> {
    const rows = await db
      .select({ userId: notificationPreferences.userId })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.event, event),
          eq(notificationPreferences.channel, 'email'),
          eq(notificationPreferences.enabled, true),
        ),
      );
    return rows.map((row) => row.userId);
  }

  /** True when this call recorded it, false when it had already been sent */
  async recordReminder(
    reminder: { taskId: string; userId: string; kind: ReminderKind; dueAt: Date },
    db: DbExecutor = this.db,
  ): Promise<boolean> {
    const rows = await db
      .insert(taskReminders)
      .values(reminder)
      .onConflictDoNothing()
      .returning({ taskId: taskReminders.taskId });
    return rows.length > 0;
  }

  async recordDigest(
    userId: string,
    weekStart: string,
    db: DbExecutor = this.db,
  ): Promise<boolean> {
    const rows = await db
      .insert(weeklyDigests)
      .values({ userId, weekStart })
      .onConflictDoNothing()
      .returning({ userId: weeklyDigests.userId });
    return rows.length > 0;
  }

  async purge(cutoffs: PurgeCutoffs, db: DbExecutor = this.db): Promise<Record<string, number>> {
    const feed = await db
      .delete(notifications)
      .where(
        or(
          lt(notifications.createdAt, cutoffs.before),
          and(isNotNull(notifications.readAt), lt(notifications.createdAt, cutoffs.readBefore)),
        ),
      );
    const reminders = await db
      .delete(taskReminders)
      .where(lt(taskReminders.dueAt, cutoffs.remindersBefore));
    const digests = await db
      .delete(weeklyDigests)
      .where(lt(weeklyDigests.weekStart, cutoffs.digestsBefore));
    return {
      notifications: feed.rowCount ?? 0,
      task_reminders: reminders.rowCount ?? 0,
      weekly_digests: digests.rowCount ?? 0,
    };
  }
}
