import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, or } from 'drizzle-orm';

import type { SwapStatus } from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { taskSwaps, type NewTaskSwapRow, type TaskSwapRow } from './tasks.schema.js';

@Injectable()
export class TaskSwapsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(values: NewTaskSwapRow, db: DbExecutor = this.db): Promise<TaskSwapRow> {
    const [row] = await db.insert(taskSwaps).values(values).returning();
    if (!row) throw new Error('Insert returned no row');
    return row;
  }

  async find(id: string, db: DbExecutor = this.db): Promise<TaskSwapRow | undefined> {
    const [row] = await db.select().from(taskSwaps).where(eq(taskSwaps.id, id)).limit(1);
    return row;
  }

  async lock(id: string, tx: DbExecutor): Promise<TaskSwapRow | undefined> {
    const [row] = await tx
      .select()
      .from(taskSwaps)
      .where(eq(taskSwaps.id, id))
      .limit(1)
      .for('update');
    return row;
  }

  async findPending(
    offeredTaskId: string,
    requestedTaskId: string,
    db: DbExecutor = this.db,
  ): Promise<TaskSwapRow | undefined> {
    const [row] = await db
      .select()
      .from(taskSwaps)
      .where(
        and(
          eq(taskSwaps.offeredTaskId, offeredTaskId),
          eq(taskSwaps.requestedTaskId, requestedTaskId),
          eq(taskSwaps.status, 'pending'),
        ),
      )
      .limit(1);
    return row;
  }

  pendingOf(groupId: string, userId: string, db: DbExecutor = this.db): Promise<TaskSwapRow[]> {
    return db
      .select()
      .from(taskSwaps)
      .where(
        and(
          eq(taskSwaps.groupId, groupId),
          eq(taskSwaps.status, 'pending'),
          or(eq(taskSwaps.proposerId, userId), eq(taskSwaps.recipientId, userId)),
        ),
      )
      .orderBy(asc(taskSwaps.createdAt));
  }

  async decide(
    id: string,
    status: Exclude<SwapStatus, 'pending'>,
    at: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db.update(taskSwaps).set({ status, decidedAt: at }).where(eq(taskSwaps.id, id));
  }
}
