// Applies pending migrations from backend/drizzle: `npm run db:migrate` in development,
// `node backend/dist/db/migrate.js` in the Docker `migrate` service
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { validateEnv } from '../config/env.validation.js';
import { createDatabase, createPool } from './database.js';

// Same relative path from src/db (tsx) and dist/db (compiled)
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

const logger = new Logger('Migrate');
const env = validateEnv(process.env);
const pool = createPool(env.DATABASE_URL);

try {
  await migrate(createDatabase(pool, { logQueries: false }), {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  logger.log('The database schema is up to date');
} finally {
  await pool.end();
}
