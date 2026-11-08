import { Injectable } from '@nestjs/common';

import type { DbExecutor } from '../../db/database.js';
import { Clock } from '../clock.js';
import type { DomainEventMap, EventType } from './domain-events.js';
import { EventPublicationStore } from './event-publication.store.js';

/** Runs inside the publisher's transaction; throwing rolls the whole change back */
export type InTransactionListener<K extends EventType> = (
  event: DomainEventMap[K],
  tx: DbExecutor,
) => Promise<void>;

/** Runs after commit from event_publications, with retries; must be idempotent */
export type AfterCommitListener<K extends EventType> = (event: DomainEventMap[K]) => Promise<void>;

// Method syntax makes the parameter bivariant, so listeners of different events share one list
interface AnyInTransactionListener {
  handle(event: DomainEventMap[EventType], tx: DbExecutor): Promise<void>;
}

export interface RegisteredListener {
  eventType: EventType;
  /** Payload as stored in event_publications */
  run: (payload: unknown) => Promise<void>;
}

/**
 * In-process event bus with two delivery modes (docs/architecture.md, "Events"):
 * - `onInTransaction`: reactions that must be consistent with the change (redistribute tasks
 *   when a member leaves). Same transaction; a failure undoes everything.
 * - `onAfterCommit`: side effects (calendar sync, emails, in-app notifications). Persisted in
 *   the same transaction, delivered by EventDispatcher after commit, retried with backoff.
 * Modules register listeners in `onModuleInit`; the publisher never knows who listens.
 */
@Injectable()
export class EventBus {
  private readonly inTransaction = new Map<EventType, AnyInTransactionListener['handle'][]>();
  private readonly afterCommit = new Map<string, RegisteredListener>();

  constructor(
    private readonly store: EventPublicationStore,
    private readonly clock: Clock,
  ) {}

  onInTransaction<K extends EventType>(type: K, listener: InTransactionListener<K>): void {
    const handle: AnyInTransactionListener['handle'] = listener;
    this.inTransaction.set(type, [...(this.inTransaction.get(type) ?? []), handle]);
  }

  /** `listenerId` is stored with each publication, so keep it stable: `calendar.syncTask` */
  onAfterCommit<K extends EventType>(
    type: K,
    listenerId: string,
    listener: AfterCommitListener<K>,
  ): void {
    if (this.afterCommit.has(listenerId)) {
      throw new Error(`Event listener "${listenerId}" is registered twice`);
    }
    this.afterCommit.set(listenerId, {
      eventType: type,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- publish() stored this payload as DomainEventMap[K]
      run: (payload) => listener(payload as DomainEventMap[K]),
    });
  }

  listener(listenerId: string): RegisteredListener | undefined {
    return this.afterCommit.get(listenerId);
  }

  /** Call with the transaction of the change that caused the event */
  async publish<K extends EventType>(
    tx: DbExecutor,
    type: K,
    event: DomainEventMap[K],
  ): Promise<void> {
    for (const listener of this.inTransaction.get(type) ?? []) {
      // oxlint-disable-next-line no-await-in-loop -- listeners share one transaction connection, so they run in order
      await listener(event, tx);
    }
    const now = this.clock.now();
    const rows = [...this.afterCommit]
      .filter(([, registered]) => registered.eventType === type)
      .map(([listenerId]) => ({
        listener: listenerId,
        eventType: type,
        payload: event,
        nextAttemptAt: now,
      }));
    await this.store.add(tx, rows);
  }
}
