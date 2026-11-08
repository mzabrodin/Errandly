import { sql, type HasDefault, type IsPrimaryKey, type NotNull } from 'drizzle-orm';
import {
  timestamp,
  uuid,
  type PgTimestampBuilderInitial,
  type PgUUIDBuilderInitial,
} from 'drizzle-orm/pg-core';

// Column builders shared by every module schema. They are single-use, hence factories

type Timestamp = PgTimestampBuilderInitial<''>;

/** Time-ordered UUID primary key (uuidv7() needs PostgreSQL 18) */
export function id(): HasDefault<IsPrimaryKey<NotNull<PgUUIDBuilderInitial<''>>>> {
  return uuid()
    .primaryKey()
    .default(sql`uuidv7()`);
}

/** Every timestamp is stored in UTC and shown in the user's timezone (SYS-15) */
export function timestamptz(): Timestamp {
  return timestamp({ withTimezone: true, mode: 'date' });
}

export function createdAt(): HasDefault<NotNull<Timestamp>> {
  return timestamptz().notNull().defaultNow();
}

export function updatedAt(): HasDefault<HasDefault<NotNull<Timestamp>>> {
  return timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
}
