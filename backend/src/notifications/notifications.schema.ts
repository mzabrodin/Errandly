import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  DEFAULT_REMINDER_MINUTES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_TYPES,
} from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';
import { groups } from '../groups/groups.schema.js';
import { tasks } from '../tasks/tasks.schema.js';
import { users } from '../users/users.schema.js';

export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const notificationEventEnum = pgEnum('notification_event', NOTIFICATION_EVENTS);
export const notificationChannelEnum = pgEnum('notification_channel', NOTIFICATION_CHANNELS);

/** Values substituted into the notification text on the frontend */
export interface NotificationData {
  groupName?: string;
  taskTitle?: string;
  actorName?: string;
  dueAt?: string;
}

/** In-app notifications (the bell); nobody is notified about their own action */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum().notNull(),
    groupId: uuid().references(() => groups.id, { onDelete: 'set null' }),
    taskId: uuid().references(() => tasks.id, { onDelete: 'set null' }),
    data: jsonb().$type<NotificationData>().notNull().default({}),
    readAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt.desc())],
);

/** Per-user scalar settings; a missing row means the defaults */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Minutes before the due time when the dueSoon reminder goes out */
    reminderMinutes: smallint().notNull().default(DEFAULT_REMINDER_MINUTES),
    updatedAt: updatedAt(),
  },
  (t) => [check('notification_settings_reminder_positive', sql`${t.reminderMinutes} > 0`)],
);

/**
 * One row per switched event and channel; a missing row means DEFAULT_NOTIFICATION_PREFERENCES.
 * A new notification kind or channel (push) is an enum value, not a new column.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    event: notificationEventEnum().notNull(),
    channel: notificationChannelEnum().notNull(),
    enabled: boolean().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.event, t.channel] })],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
export type NotificationSettingsRow = typeof notificationSettings.$inferSelect;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
