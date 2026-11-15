import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { Clock } from './clock.js';
import { errorMessage } from './errors/error-message.js';
import { ExclusiveRunner } from './exclusive-runner.js';

export type Purge = (now: Date) => Promise<Record<string, number>>;

/** NFR-LEG-01; the periods are in docs/data-model.md */
@Injectable()
export class DataRetention implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(DataRetention.name);
  private readonly runner = new ExclusiveRunner(this.logger, 'Data purge');
  private readonly purges = new Map<string, Purge>();
  private readonly enabled: boolean;

  constructor(
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.enabled = config.get('SCHEDULER_ENABLED', { infer: true });
  }

  register(owner: string, purge: Purge): void {
    if (this.purges.has(owner)) throw new Error(`A purge for "${owner}" is registered twice`);
    this.purges.set(owner, purge);
  }

  /** Also at start-up, so a server restarted every night still purges */
  onApplicationBootstrap(): void {
    if (this.enabled) void this.tick();
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.runner.stop();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  tick(): Promise<void> {
    return this.enabled ? this.runner.run(() => this.purge()) : Promise.resolve();
  }

  async purge(): Promise<Record<string, number>> {
    const now = this.clock.now();
    const deleted: Record<string, number> = {};
    for (const [owner, purge] of this.purges) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one module at a time keeps the load on the database low
        Object.assign(deleted, await purge(now));
      } catch (error: unknown) {
        this.logger.warn(`Purging ${owner} data failed: ${errorMessage(error)}`);
      }
    }
    const summary = Object.entries(deleted).filter(([, count]) => count > 0);
    if (summary.length > 0) {
      this.logger.log(`Purged ${summary.map(([table, count]) => `${table} ${count}`).join(', ')}`);
    }
    return deleted;
  }
}
