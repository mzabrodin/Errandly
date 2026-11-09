// Starts one PostgreSQL 18 for the whole e2e run and migrates it from zero.
// E2E_DATABASE_URL points the tests at an existing database instead (no Docker needed);
// every test truncates all tables, so never point it at data you want to keep.
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { TestProject } from 'vitest/node';

import { createDatabase, createPool } from '../../src/db/database.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function migrateFromZero(url: string): Promise<void> {
  const pool = createPool(url);
  try {
    await migrate(createDatabase(pool, { logQueries: false }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } finally {
    await pool.end();
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer | undefined;
  let url = process.env['E2E_DATABASE_URL'];
  if (url === undefined || url === '') {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    url = container.getConnectionUri();
  }
  await migrateFromZero(url);
  project.provide('databaseUrl', url);

  return async () => {
    await container?.stop();
  };
}
