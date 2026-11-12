// Starts one PostgreSQL 18 and one SeaweedFS for the whole e2e run and migrates the database.
// E2E_DATABASE_URL and E2E_S3_ENDPOINT point the tests at existing services instead (no Docker
// needed); every test truncates all tables, so never point them at data you want to keep.
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import { DEV_STORAGE } from '../../src/config/env.validation.js';
import { createDatabase, createPool } from '../../src/db/database.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    storageEndpoint: string;
  }
}

// Keep in sync with the `storage` service in docker-compose.yaml
const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.48';
const S3_PORT = 8333;

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

function configured(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

async function startDatabase(containers: StartedTestContainer[]): Promise<string> {
  const existing = configured('E2E_DATABASE_URL');
  if (existing !== undefined) return existing;
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  containers.push(container);
  return container.getConnectionUri();
}

async function startStorage(containers: StartedTestContainer[]): Promise<string> {
  const existing = configured('E2E_S3_ENDPOINT');
  if (existing !== undefined) return existing;
  const container = await new GenericContainer(SEAWEEDFS_IMAGE)
    .withCommand(['mini'])
    .withEnvironment({
      AWS_ACCESS_KEY_ID: DEV_STORAGE.S3_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: DEV_STORAGE.S3_SECRET_ACCESS_KEY,
    })
    .withExposedPorts(S3_PORT)
    .withWaitStrategy(Wait.forHttp('/healthz', S3_PORT).forStatusCode(200))
    .start();
  containers.push(container);
  return `http://${container.getHost()}:${container.getMappedPort(S3_PORT)}`;
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const containers: StartedTestContainer[] = [];
  const [databaseUrl, storageEndpoint] = await Promise.all([
    startDatabase(containers),
    startStorage(containers),
  ]);
  await migrateFromZero(databaseUrl);
  project.provide('databaseUrl', databaseUrl);
  project.provide('storageEndpoint', storageEndpoint);

  return async () => {
    await Promise.all(containers.map((container) => container.stop()));
  };
}
