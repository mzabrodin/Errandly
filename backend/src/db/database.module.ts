import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseHealth } from './database-health.js';
import { APP_POOL_LIMITS, createDatabase, createPool, DATABASE, PG_POOL } from './database.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): pg.Pool =>
        createPool(config.get('DATABASE_URL', { infer: true }), APP_POOL_LIMITS),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: createDatabase,
    },
    DatabaseHealth,
  ],
  exports: [DATABASE, DatabaseHealth],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** Last: everything that used the pool has finished in beforeApplicationShutdown */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    new Logger('Shutdown').log('Database pool closed, shutdown complete');
  }
}
