import { Injectable, type OnModuleInit } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { EventBus } from '../common/events/event-bus.js';
import type { DbExecutor } from '../db/database.js';
import { TaskPlanner } from './task-planner.js';
import { TasksRepository } from './tasks.repository.js';
import { localDay } from './tasks.rules.js';

/** In the group change's transaction: a failed reassignment undoes the change too */
@Injectable()
export class TaskRedistribution implements OnModuleInit {
  constructor(
    private readonly repository: TasksRepository,
    private readonly planner: TaskPlanner,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.bus.onInTransaction('group.memberLeft', ({ groupId, userId }, tx) =>
      this.memberLeft(groupId, userId, tx),
    );
    this.bus.onInTransaction('group.absenceAdded', ({ groupId, userId, from, to }, tx) =>
      this.absenceAdded(groupId, userId, from, to, tx),
    );
  }

  /** FR-15: manual assignments move too */
  async memberLeft(groupId: string, userId: string, tx: DbExecutor): Promise<void> {
    await this.repository.clearSeriesAssignee(groupId, userId, tx);
    const open = await this.repository.openTasksOf(groupId, userId, this.clock.now(), tx);
    await this.planner.reassign(groupId, open, tx);
  }

  /** FR-17: manual assignments stay */
  async absenceAdded(
    groupId: string,
    userId: string,
    from: string,
    to: string,
    tx: DbExecutor,
  ): Promise<void> {
    const open = await this.repository.openTasksOf(groupId, userId, this.clock.now(), tx);
    const affected = open.filter((task) => {
      const day = localDay(task.dueAt, task.series.timezone);
      return !task.manuallyAssigned && from <= day && day <= to;
    });
    await this.planner.reassign(groupId, affected, tx);
  }
}
