import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte } from 'drizzle-orm';

import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import type { AssignedTask } from './assignment/assignment-strategy.js';
import {
  tasks,
  taskSeries,
  type NewTaskRow,
  type NewTaskSeriesRow,
  type TaskRow,
  type TaskSeriesRow,
} from './tasks.schema.js';

export interface TaskWithSeries extends TaskRow {
  series: Pick<TaskSeriesRow, 'recurrenceType' | 'weekdays' | 'timezone'>;
}

export interface TaskFilter {
  from?: Date;
  to?: Date;
  seriesId?: string;
}

export type TaskChanges = Partial<
  Pick<
    NewTaskRow,
    | 'title'
    | 'description'
    | 'dueAt'
    | 'difficulty'
    | 'assigneeId'
    | 'manuallyAssigned'
    | 'completedAt'
    | 'completedBy'
  >
>;

export type SeriesChanges = Partial<
  Pick<
    NewTaskSeriesRow,
    | 'title'
    | 'description'
    | 'difficulty'
    | 'recurrenceType'
    | 'weekdays'
    | 'startsAt'
    | 'timezone'
    | 'materializedUntil'
    | 'endedAt'
    | 'assigneeId'
  >
>;

const seriesColumns = {
  recurrenceType: taskSeries.recurrenceType,
  weekdays: taskSeries.weekdays,
  timezone: taskSeries.timezone,
};

function withSeries(rows: { task: TaskRow; series: TaskWithSeries['series'] }[]): TaskWithSeries[] {
  return rows.map(({ task, series }) => ({ ...task, series }));
}

@Injectable()
export class TasksRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insertSeries(values: NewTaskSeriesRow, db: DbExecutor = this.db): Promise<TaskSeriesRow> {
    const [row] = await db.insert(taskSeries).values(values).returning();
    if (!row) throw new Error('INSERT … RETURNING returned no row');
    return row;
  }

  async findSeries(id: string, db: DbExecutor = this.db): Promise<TaskSeriesRow | undefined> {
    const [row] = await db.select().from(taskSeries).where(eq(taskSeries.id, id)).limit(1);
    return row;
  }

  async updateSeries(id: string, changes: SeriesChanges, db: DbExecutor = this.db): Promise<void> {
    await db.update(taskSeries).set(changes).where(eq(taskSeries.id, id));
  }

  async clearSeriesAssignee(
    groupId: string,
    userId: string,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .update(taskSeries)
      .set({ assigneeId: null })
      .where(and(eq(taskSeries.groupId, groupId), eq(taskSeries.assigneeId, userId)));
  }

  async deleteSeries(id: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(taskSeries).where(eq(taskSeries.id, id));
  }

  seriesToTopUp(threshold: Date, db: DbExecutor = this.db): Promise<TaskSeriesRow[]> {
    return db
      .select()
      .from(taskSeries)
      .where(
        and(
          lt(taskSeries.materializedUntil, threshold),
          isNull(taskSeries.endedAt),
          inArray(taskSeries.recurrenceType, ['daily', 'weekly', 'monthly']),
        ),
      );
  }

  /** The unique (series_id, due_at) key makes a repeated top-up harmless */
  insertTasks(rows: NewTaskRow[], db: DbExecutor = this.db): Promise<TaskRow[]> {
    if (rows.length === 0) return Promise.resolve([]);
    return db
      .insert(tasks)
      .values(rows)
      .onConflictDoNothing({ target: [tasks.seriesId, tasks.dueAt] })
      .returning();
  }

  async findTask(id: string, db: DbExecutor = this.db): Promise<TaskWithSeries | undefined> {
    const [row] = withSeries(
      await db
        .select({ task: tasks, series: seriesColumns })
        .from(tasks)
        .innerJoin(taskSeries, eq(taskSeries.id, tasks.seriesId))
        .where(eq(tasks.id, id))
        .limit(1),
    );
    return row;
  }

  /** NO KEY UPDATE, so a calendar sync holding the task does not block edits */
  async lockTask(id: string, tx: DbExecutor): Promise<TaskRow | undefined> {
    const [row] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)
      .for('no key update');
    return row;
  }

  async holdTask(id: string, tx: DbExecutor): Promise<TaskRow | undefined> {
    const [row] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1).for('key share');
    return row;
  }

  assignedTo(userId: string, from: Date, db: DbExecutor = this.db): Promise<TaskRow[]> {
    return db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assigneeId, userId), gte(tasks.dueAt, from)))
      .orderBy(asc(tasks.dueAt));
  }

  async lockTasks(ids: readonly string[], tx: DbExecutor): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.id, [...ids]))
      .for('update');
  }

  lockGroupTasks(groupId: string, tx: DbExecutor): Promise<TaskRow[]> {
    return tx.select().from(tasks).where(eq(tasks.groupId, groupId)).for('update');
  }

  async updateTask(id: string, changes: TaskChanges, db: DbExecutor = this.db): Promise<void> {
    await db.update(tasks).set(changes).where(eq(tasks.id, id));
  }

  async deleteTasks(ids: readonly string[], db: DbExecutor = this.db): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(tasks).where(inArray(tasks.id, [...ids]));
  }

  async listTasks(
    groupId: string,
    { from, to, seriesId }: TaskFilter,
    db: DbExecutor = this.db,
  ): Promise<TaskWithSeries[]> {
    return withSeries(
      await db
        .select({ task: tasks, series: seriesColumns })
        .from(tasks)
        .innerJoin(taskSeries, eq(taskSeries.id, tasks.seriesId))
        .where(
          and(
            eq(tasks.groupId, groupId),
            from === undefined ? undefined : gte(tasks.dueAt, from),
            to === undefined ? undefined : lt(tasks.dueAt, to),
            seriesId === undefined ? undefined : eq(tasks.seriesId, seriesId),
          ),
        )
        .orderBy(asc(tasks.dueAt), asc(tasks.id)),
    );
  }

  assignmentHistory(
    groupId: string,
    from: Date,
    to: Date,
    db: DbExecutor = this.db,
  ): Promise<AssignedTask[]> {
    return db
      .select({
        seriesId: tasks.seriesId,
        dueAt: tasks.dueAt,
        difficulty: tasks.difficulty,
        assigneeId: tasks.assigneeId,
      })
      .from(tasks)
      .where(and(eq(tasks.groupId, groupId), gt(tasks.dueAt, from), lte(tasks.dueAt, to)));
  }

  async openTasksOf(
    groupId: string,
    userId: string,
    after: Date,
    db: DbExecutor = this.db,
  ): Promise<TaskWithSeries[]> {
    return withSeries(
      await db
        .select({ task: tasks, series: seriesColumns })
        .from(tasks)
        .innerJoin(taskSeries, eq(taskSeries.id, tasks.seriesId))
        .where(
          and(
            eq(tasks.groupId, groupId),
            eq(tasks.assigneeId, userId),
            isNull(tasks.completedAt),
            gt(tasks.dueAt, after),
          ),
        )
        .orderBy(asc(tasks.dueAt)),
    );
  }

  unfinishedOfSeries(seriesId: string, from?: Date, db: DbExecutor = this.db): Promise<TaskRow[]> {
    return db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.seriesId, seriesId),
          isNull(tasks.completedAt),
          from === undefined ? undefined : gte(tasks.dueAt, from),
        ),
      );
  }

  async countInstances(seriesId: string, db: DbExecutor = this.db): Promise<number> {
    return db.$count(tasks, eq(tasks.seriesId, seriesId));
  }
}
