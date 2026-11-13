import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { LIMITS, RECURRENCE_TYPES } from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';
import { groups } from '../groups/groups.schema.js';
import { users } from '../users/users.schema.js';

export const recurrenceTypeEnum = pgEnum('recurrence_type', RECURRENCE_TYPES);

function difficultyRange(column: AnyPgColumn): SQL {
  return sql`${column} between ${sql.raw(String(LIMITS.difficultyMin))} and ${sql.raw(String(LIMITS.difficultyMax))}`;
}

/** The recurrence rule of a task; a one-off task is a series with a single instance (FR-19–21) */
export const taskSeries = pgTable(
  'task_series',
  {
    id: id(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    title: varchar({ length: LIMITS.taskTitle }).notNull(),
    description: text().notNull().default(''),
    difficulty: smallint().notNull(),
    recurrenceType: recurrenceTypeEnum().notNull(),
    /** ISO weekdays for weekly series: 1 = Monday … 7 = Sunday */
    weekdays: smallint()
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    /** Due time of the first instance; later ones keep its time of day */
    startsAt: timestamptz().notNull(),
    /** Instances exist up to this moment; the scheduler tops them up daily */
    materializedUntil: timestamptz().notNull(),
    /** The creating admin's zone, so instances keep their local time across DST (SYS-15) */
    timezone: text().notNull().default('Europe/Kyiv'),
    /** Deleted while completed instances remain; the top-up skips it */
    endedAt: timestamptz(),
    /** Null: the algorithm picks each instance's assignee */
    assigneeId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('task_series_group_id_idx').on(t.groupId),
    check('task_series_difficulty_range', difficultyRange(t.difficulty)),
    check(
      'task_series_weekdays',
      sql`${t.weekdays} <@ array[1,2,3,4,5,6,7]::smallint[] and (${t.recurrenceType} <> 'weekly' or cardinality(${t.weekdays}) > 0)`,
    ),
  ],
);

/** Status is computed, never stored: done → overdue → unassigned → planned */
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    seriesId: uuid()
      .notNull()
      .references(() => taskSeries.id, { onDelete: 'cascade' }),
    /** Copied from the series so range queries per group need no join */
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    title: varchar({ length: LIMITS.taskTitle }).notNull(),
    description: text().notNull().default(''),
    dueAt: timestamptz().notNull(),
    difficulty: smallint().notNull(),
    assigneeId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** A manual assignment is never overwritten by the algorithm (FR-30) */
    manuallyAssigned: boolean().notNull().default(false),
    completedAt: timestamptz(),
    completedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Materialising a series twice must not duplicate instances
    unique('tasks_series_due_key').on(t.seriesId, t.dueAt),
    index('tasks_group_due_idx').on(t.groupId, t.dueAt),
    index('tasks_assignee_due_idx').on(t.assigneeId, t.dueAt),
    check('tasks_difficulty_range', difficultyRange(t.difficulty)),
  ],
);

export type TaskSeriesRow = typeof taskSeries.$inferSelect;
export type NewTaskSeriesRow = typeof taskSeries.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
