import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseHealth } from './database-health.js';
import { createDatabase, createPool, DATABASE, PG_POOL } from './database.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): pg.Pool =>
        createPool(config.get('DATABASE_URL', { infer: true })),
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

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
