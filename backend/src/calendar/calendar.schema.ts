import {
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

import { CALENDAR_PROVIDERS, LIMITS, SYNC_STATUSES } from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';
import { tasks } from '../tasks/tasks.schema.js';
import { users } from '../users/users.schema.js';

export const calendarProviderEnum = pgEnum('calendar_provider', CALENDAR_PROVIDERS);
export const syncStatusEnum = pgEnum('sync_status', SYNC_STATUSES);

/**
 * A connected external calendar; a separate OAuth flow from sign-in (SYS-18). Provider-agnostic:
 * Outlook or Apple = a new enum value and a CalendarGateway, same tables.
 */
export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: calendarProviderEnum().notNull(),
    /** The external account, shown in the settings */
    accountEmail: varchar({ length: LIMITS.email }).notNull(),
    /** OAuth tokens, encrypted with TOKEN_ENCRYPTION_KEY before they are stored */
    refreshTokenEncrypted: text().notNull(),
    accessTokenEncrypted: text(),
    accessTokenExpiresAt: timestamptz(),
    /** The calendar the events are written to */
    calendarId: text().notNull().default('primary'),
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
