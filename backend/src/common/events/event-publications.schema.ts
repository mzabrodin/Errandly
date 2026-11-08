import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, smallint, text } from 'drizzle-orm/pg-core';

import { createdAt, id, timestamptz } from '../../db/columns.js';

/**
 * Event publication registry (as in Spring Modulith): one row per event and after-commit
 * listener, written in the publisher's transaction, so a side effect is never lost and never
 * rolls the business change back. EventDispatcher delivers due rows and retries with backoff.
 */
export const eventPublications = pgTable(
  'event_publications',
  {
    id: id(),
    /** Stable listener id, e.g. `calendar.syncTask` */
    listener: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb().$type<unknown>().notNull(),
    publishedAt: createdAt(),
    attempts: smallint().notNull().default(0),
    /** Null once the listener has given up (MAX_ATTEMPTS) or succeeded */
    nextAttemptAt: timestamptz(),
    lastError: text(),
    completedAt: timestamptz(),
  },
  (t) => [
    index('event_publications_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.completedAt} is null`),
  ],
);

export type EventPublicationRow = typeof eventPublications.$inferSelect;
export type NewEventPublicationRow = typeof eventPublications.$inferInsert;
