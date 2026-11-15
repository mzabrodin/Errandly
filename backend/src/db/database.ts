import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { QueryLogger } from './query-logger.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Repositories accept either, so a service decides the transaction boundary */
export type DbExecutor = Database | Transaction;

export const DATABASE = Symbol('DATABASE');
export const PG_POOL = Symbol('PG_POOL');

/** The CLI scripts (migrations) run without these */
export const APP_POOL_LIMITS: pg.PoolConfig = {
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  idleTimeoutMillis: 30_000,
};

export function createPool(connectionString: string, limits: pg.PoolConfig = {}): pg.Pool {
  // The pool connects lazily, so the app boots (and api:sync runs) without a database
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, ...limits });
}

/** `logQueries` is off for the CLI scripts, whose standalone logger would print every statement */
export function createDatabase(pool: pg.Pool, { logQueries = true } = {}): Database {
  return drizzle({
    client: pool,
    schema,
    casing: 'snake_case',
    ...(logQueries && { logger: new QueryLogger() }),
  });
}
