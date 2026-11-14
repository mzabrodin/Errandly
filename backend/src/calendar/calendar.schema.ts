import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  CALENDAR_PROVIDERS,
  DEFAULT_CALENDAR_REMINDER_MINUTES,
  LIMITS,
  SYNC_STATUSES,
} from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';
import { tasks } from '../tasks/tasks.schema.js';
import { users } from '../users/users.schema.js';

export const calendarProviderEnum = pgEnum('calendar_provider', CALENDAR_PROVIDERS);
export const syncStatusEnum = pgEnum('sync_status', SYNC_STATUSES);

/** A separate OAuth flow from sign-in (SYS-18) */
export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: calendarProviderEnum().notNull(),
    accountEmail: varchar({ length: LIMITS.email }).notNull(),
    /** Encrypted (NFR-SEC-05); access tokens are never stored */
    refreshTokenEncrypted: text().notNull(),
    calendarId: text().notNull(),
    syncStatus: syncStatusEnum().notNull().default('ok'),
    /** Consecutive failures; the 5th one pauses the sync (SYS-21) */
    failedAttempts: smallint().notNull().default(0),
    lastError: text(),
    lastSyncedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('calendar_connections_user_provider_key').on(t.userId, t.provider)],
);

/** Kept across reconnects; a missing row means the default */
export const calendarSettings = pgTable(
  'calendar_settings',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderMinutes: smallint().notNull().default(DEFAULT_CALENDAR_REMINDER_MINUTES),
    updatedAt: updatedAt(),
  },
  (t) => [check('calendar_settings_reminder_positive', sql`${t.reminderMinutes} > 0`)],
);

/** Events Errandly created, per connection; it never touches any other event (SYS-19) */
export const calendarEventLinks = pgTable(
  'calendar_event_links',
  {
    connectionId: uuid()
      .notNull()
      .references(() => calendarConnections.id, { onDelete: 'cascade' }),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    externalEventId: text().notNull(),
    syncedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.connectionId, t.taskId] }),
    index('calendar_event_links_task_id_idx').on(t.taskId),
  ],
);

export type CalendarConnectionRow = typeof calendarConnections.$inferSelect;
export type CalendarEventLinkRow = typeof calendarEventLinks.$inferSelect;
