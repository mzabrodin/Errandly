import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { Clock } from '../clock.js';
import { EventBus } from './event-bus.js';
import { EventPublicationStore } from './event-publication.store.js';
import type { EventPublicationRow } from './event-publications.schema.js';

/** SYS-21: up to 5 attempts, then the listener gives up (calendar sync pauses) */
export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
/** How long a claimed publication is hidden from other ticks while it runs */
const LEASE_MS = 5 * 60 * 1000;
const INTERVAL_NAME = 'event-dispatcher';

/** Exponential backoff after the n-th failed attempt: 30 s, 2 min, 8 min, 32 min */
export function retryDelayMs(failedAttempts: number): number {
  return 30_000 * 4 ** (failedAttempts - 1);
}

/** Delivers after-commit events from event_publications (EVENTS_POLL_INTERVAL_MS, 0 = off) */
@Injectable()
export class EventDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventDispatcher.name);
  private running = false;

  constructor(
    private readonly store: EventPublicationStore,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.get('EVENTS_POLL_INTERVAL_MS', { infer: true });
    if (intervalMs === 0) return;
    const timer = setInterval(() => void this.tick(), intervalMs);
    timer.unref();
    this.scheduler.addInterval(INTERVAL_NAME, timer);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME);
    }
  }

  /** One poll; overlapping ticks are skipped and a failing database is only logged */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchDue();
    } catch (error: unknown) {
      this.logger.warn(
        `Event dispatch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  async dispatchDue(): Promise<number> {
    const now = this.clock.now();
    const due = await this.store.claimDue(now, BATCH_SIZE, new Date(now.getTime() + LEASE_MS));
    for (const publication of due) {
      // oxlint-disable-next-line no-await-in-loop -- one at a time keeps external APIs (Google) under their rate limits
      await this.deliver(publication);
    }
    return due.length;
  }

  private async deliver(publication: EventPublicationRow): Promise<void> {
    try {
      const listener = this.bus.listener(publication.listener);
      if (!listener) throw new Error(`No listener "${publication.listener}" is registered`);
      await listener.run(publication.payload);
      await this.store.complete(publication.id, this.clock.now());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const attempts = publication.attempts + 1;
      const gaveUp = attempts >= MAX_ATTEMPTS;
      const nextAttemptAt = gaveUp
        ? null
        : new Date(this.clock.now().getTime() + retryDelayMs(attempts));
      await this.store.fail(publication.id, attempts, nextAttemptAt, message);
      const where = `${publication.listener} for ${publication.eventType} (${publication.id})`;
      if (gaveUp) this.logger.error(`Gave up on ${where} after ${attempts} attempts: ${message}`);
      else this.logger.warn(`Attempt ${attempts} of ${where} failed, retrying: ${message}`);
    }
  }
}
