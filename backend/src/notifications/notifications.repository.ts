import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  DEFAULT_EMAIL_REMINDER_MINUTES,
  type NotificationChannel,
  type NotificationEvent,
} from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { notificationPreferences, notificationSettings } from './notifications.schema.js';

export interface PreferenceOverride {
  event: NotificationEvent;
  channel: NotificationChannel;
  enabled: boolean;
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
    await db
      .delete(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.event, event),
          eq(notificationPreferences.channel, channel),
        ),
      );
  }
}
