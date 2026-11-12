import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

import type { DbExecutor } from './database.js';
import * as schema from './schema.js';

/** Found in the schema, so a new table is never forgotten */
export function allTables(): PgTable[] {
  const tables: PgTable[] = [];
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) tables.push(value);
  }
  return tables;
}

export async function truncateAll(db: DbExecutor): Promise<void> {
  const tableList = allTables()
    .map((table) => `"${getTableName(table)}"`)
    .join(', ');
  await db.execute(sql.raw(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`));
}
