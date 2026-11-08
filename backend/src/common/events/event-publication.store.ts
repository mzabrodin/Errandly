import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { DATABASE, type Database, type DbExecutor } from '../../db/database.js';
import {
  eventPublications,
  type EventPublicationRow,
  type NewEventPublicationRow,
} from './event-publications.schema.js';

/** Repository of the event publication registry */
@Injectable()
export class EventPublicationStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Called inside the publisher's transaction, so the rows commit or roll back with the change */
  async add(executor: DbExecutor, rows: NewEventPublicationRow[]): Promise<void> {
    if (rows.length === 0) return;
    await executor.insert(eventPublications).values(rows);
  }

  /**
   * Takes up to `limit` due publications and pushes their next attempt to `leaseUntil`, so another
   * instance (SKIP LOCKED) or the next tick does not deliver them twice while they run.
   */
  claimDue(now: Date, limit: number, leaseUntil: Date): Promise<EventPublicationRow[]> {
    const due = this.db
      .select({ id: eventPublications.id })
      .from(eventPublications)
      .where(and(isNull(eventPublications.completedAt), lte(eventPublications.nextAttemptAt, now)))
      .orderBy(asc(eventPublications.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    return this.db
      .update(eventPublications)
      .set({ nextAttemptAt: leaseUntil })
      .where(inArray(eventPublications.id, due))
      .returning();
  }

  async complete(id: string, at: Date): Promise<void> {
    await this.db
      .update(eventPublications)
      .set({ completedAt: at, nextAttemptAt: null, lastError: null })
      .where(eq(eventPublications.id, id));
  }

  /** `nextAttemptAt: null` means the listener has given up */
  async fail(
    id: string,
    attempts: number,
    nextAttemptAt: Date | null,
    error: string,
  ): Promise<void> {
    await this.db
      .update(eventPublications)
      .set({ attempts, nextAttemptAt, lastError: error.slice(0, 2000) })
      .where(eq(eventPublications.id, id));
  }
}
