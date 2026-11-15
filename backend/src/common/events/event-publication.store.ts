import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, lte } from 'drizzle-orm';

import { DATABASE, type Database, type DbExecutor } from '../../db/database.js';
import { addMs, DAY_MS } from '../time.js';
import {
  eventPublications,
  type EventPublicationRow,
  type NewEventPublicationRow,
} from './event-publications.schema.js';

const DELIVERED_RETENTION_MS = 7 * DAY_MS;
const GAVE_UP_RETENTION_MS = 30 * DAY_MS;

@Injectable()
export class EventPublicationStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Called inside the publisher's transaction, so the rows commit or roll back with the change */
  async add(executor: DbExecutor, rows: NewEventPublicationRow[]): Promise<void> {
    if (rows.length === 0) return;
    await executor.insert(eventPublications).values(rows);
  }

  /** The lease keeps another instance (SKIP LOCKED) or the next tick from delivering them twice */
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

  async release(ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(eventPublications)
      .set({ nextAttemptAt: at })
      .where(and(inArray(eventPublications.id, ids), isNull(eventPublications.completedAt)));
  }

  async purge(now: Date): Promise<Record<string, number>> {
    const delivered = await this.db
      .delete(eventPublications)
      .where(lt(eventPublications.completedAt, addMs(now, -DELIVERED_RETENTION_MS)));
    // A listener gives up within an hour of the publication, so its age tells when
    const gaveUp = await this.db
      .delete(eventPublications)
      .where(
        and(
          isNull(eventPublications.completedAt),
          isNull(eventPublications.nextAttemptAt),
          lt(eventPublications.publishedAt, addMs(now, -GAVE_UP_RETENTION_MS)),
        ),
      );
    return { event_publications: (delivered.rowCount ?? 0) + (gaveUp.rowCount ?? 0) };
  }

  /** Deliveries still waiting although they were due before `before`: the dispatcher is stuck */
  countOverdue(before: Date): Promise<number> {
    return this.db.$count(
      eventPublications,
      and(isNull(eventPublications.completedAt), lte(eventPublications.nextAttemptAt, before)),
    );
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
