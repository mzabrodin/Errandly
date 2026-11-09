// Development/test only: wipes every table and loads the demo data (npm run db:seed).
// Never part of the migrations and never run on boot.
import { Logger } from '@nestjs/common';

import { Argon2PasswordHasher } from '../auth/index.js';
import { NodeEnv, validateEnv } from '../config/env.validation.js';
import { createDatabase, createPool } from './database.js';
import * as schema from './schema.js';
import { buildSeed, DEMO_PASSWORD } from './seed-data.js';
import { truncateAll } from './tables.js';

const logger = new Logger('Seed');
const env = validateEnv(process.env);

if (env.NODE_ENV === NodeEnv.Production) {
  logger.error('Refusing to seed: NODE_ENV is production and seeding wipes every table');
  process.exit(1);
}

const pool = createPool(env.DATABASE_URL);
const db = createDatabase(pool, { logQueries: false });

try {
  const data = buildSeed(new Date(), await new Argon2PasswordHasher().hash(DEMO_PASSWORD));

  await db.transaction(async (tx) => {
    await truncateAll(tx);
    await tx.insert(schema.users).values(data.users);
    await tx.insert(schema.passwordCredentials).values(data.passwordCredentials);
    await tx.insert(schema.groups).values(data.groups);
    await tx.insert(schema.memberships).values(data.memberships);
    await tx.insert(schema.absences).values(data.absences);
    await tx.insert(schema.invites).values(data.invites);
    await tx.insert(schema.taskSeries).values(data.taskSeries);
    await tx.insert(schema.tasks).values(data.tasks);
    await tx.insert(schema.notifications).values(data.notifications);
  });

  logger.log(
    `Seeded ${data.users.length} users, ${data.groups.length} groups, ${data.tasks.length} tasks ` +
      `and ${data.notifications.length} notifications. Sign in as anya@errandly.dev / ${DEMO_PASSWORD}`,
  );
} finally {
  await pool.end();
}
