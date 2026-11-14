import { Injectable } from '@nestjs/common';

import type { DbExecutor } from '../db/database.js';
import { TasksRepository } from './tasks.repository.js';
import type { TaskRow } from './tasks.schema.js';

export interface TaskView {
  id: string;
  groupId: string;
  title: string;
  description: string;
  dueAt: Date;
  assigneeId: string | null;
  completedAt: Date | null;
}

function toView(row: TaskRow): TaskView {
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt,
    assigneeId: row.assigneeId,
    completedAt: row.completedAt,
  };
}

@Injectable()
export class TasksApi {
  constructor(private readonly repository: TasksRepository) {}

  /** Blocks deleting the task until `tx` ends; edits go on */
  async hold(taskId: string, tx: DbExecutor): Promise<TaskView | null> {
    const row = await this.repository.holdTask(taskId, tx);
    return row ? toView(row) : null;
  }

  async assignedTo(userId: string, from: Date): Promise<TaskView[]> {
    return (await this.repository.assignedTo(userId, from)).map(toView);
  }
}
