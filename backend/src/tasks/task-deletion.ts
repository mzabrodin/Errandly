import { Injectable, type OnModuleInit } from '@nestjs/common';

import { EventBus } from '../common/events/event-bus.js';
import type { DbExecutor } from '../db/database.js';
import { TasksRepository } from './tasks.repository.js';
import type { TaskRow } from './tasks.schema.js';

/** Lock, announce, delete: task.deleted listeners still see the row and its calendar links */
@Injectable()
export class TaskDeletion implements OnModuleInit {
  constructor(
    private readonly repository: TasksRepository,
    private readonly bus: EventBus,
  ) {}

  onModuleInit(): void {
    this.bus.onInTransaction('group.deleted', async ({ groupId }, tx) => {
      await this.delete(await this.repository.lockGroupTasks(groupId, tx), tx);
    });
  }

  async delete(instances: readonly TaskRow[], tx: DbExecutor): Promise<void> {
    if (instances.length === 0) return;
    const ids = instances.map((task) => task.id);
    await this.repository.lockTasks(ids, tx);
    for (const task of instances) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the inserts run in order anyway
      await this.bus.publish(tx, 'task.deleted', {
        taskId: task.id,
        groupId: task.groupId,
        assigneeId: task.assigneeId,
      });
    }
    await this.repository.deleteTasks(ids, tx);
  }
}
