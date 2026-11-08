import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';

import { PG_POOL } from './database.js';

@Injectable()
export class DatabaseHealth {
  private readonly logger = new Logger(DatabaseHealth.name);

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** True when PostgreSQL answers a trivial query */
  async isUp(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch (error: unknown) {
      this.logger.warn(
        `Database is unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }
}
