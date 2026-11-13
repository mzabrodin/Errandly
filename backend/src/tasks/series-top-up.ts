import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Clock } from '../common/clock.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DATABASE, type Database } from '../db/database.js';
import { TaskPlanner } from './task-planner.js';
import { TasksRepository } from './tasks.repository.js';
import { HORIZON_MS } from './tasks.rules.js';

/** FR-21; also at start-up, so runs missed while the server was down catch up (SYS-25) */
@Injectable()
export class SeriesTopUp implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeriesTopUp.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TasksRepository,
    private readonly planner: TaskPlanner,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.enabled = config.get('SCHEDULER_ENABLED', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (this.enabled) void this.tick();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.topUp();
    } catch (error: unknown) {
      this.logger.warn(
        `Series top-up failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  async topUp(): Promise<number> {
    const until = new Date(this.clock.now().getTime() + HORIZON_MS);
    let created = 0;
    for (const series of await this.repository.seriesToTopUp(until)) {
      // oxlint-disable-next-line no-await-in-loop -- one series at a time keeps the transactions short
      created += await this.db.transaction(async (tx) => {
        const fresh = await this.repository.findSeries(series.id, tx);
        if (!fresh || fresh.endedAt !== null) return 0;
        const tasks = await this.planner.materialize(
          fresh,
          { after: fresh.materializedUntil, until },
          null,
          tx,
        );
        return tasks.length;
      });
    }
    return created;
  }
}
