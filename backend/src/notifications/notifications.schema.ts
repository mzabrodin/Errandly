import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  DEFAULT_EMAIL_REMINDER_MINUTES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_TYPES,
  REMINDER_KINDS,
} from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';
import { groups } from '../groups/groups.schema.js';
import { tasks } from '../tasks/tasks.schema.js';
import { users } from '../users/users.schema.js';

export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const notificationEventEnum = pgEnum('notification_event', NOTIFICATION_EVENTS);
export const notificationChannelEnum = pgEnum('notification_channel', NOTIFICATION_CHANNELS);
export const reminderKindEnum = pgEnum('reminder_kind', REMINDER_KINDS);

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

/** A missing row means the defaults */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** When the taskDueSoon email goes out */
    reminderMinutes: smallint().notNull().default(DEFAULT_EMAIL_REMINDER_MINUTES),
    updatedAt: updatedAt(),
  },
  (t) => [check('notification_settings_reminder_positive', sql`${t.reminderMinutes} > 0`)],
);

/** Only overrides of DEFAULT_NOTIFICATION_PREFERENCES; a new event or channel is an enum value */
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

/** Each reminder goes out once; a new due date allows a new one */
export const taskReminders = pgTable(
  'task_reminders',
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reminderKindEnum().notNull(),
    dueAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId, t.kind, t.dueAt] })],
);

/** `weekStart`: the user's local Monday */
export const weeklyDigests = pgTable(
  'weekly_digests',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date({ mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart] })],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
