import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/index.js';
import { UsersModule } from '../users/index.js';
import { AssignmentStrategy } from './assignment/assignment-strategy.js';
import { LeastLoadRotationStrategy } from './assignment/least-load-rotation.strategy.js';
import { SeriesTopUp } from './series-top-up.js';
import { TaskDeletion } from './task-deletion.js';
import { TaskPlanner } from './task-planner.js';
import { TaskRedistribution } from './task-redistribution.js';
import { TaskSwapsController } from './task-swaps.controller.js';
import { TaskSwapsRepository } from './task-swaps.repository.js';
import { TaskSwaps } from './task-swaps.service.js';
import { TasksApi } from './tasks-api.js';
import { TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [GroupsModule, UsersModule],
  controllers: [TasksController, TaskSwapsController],
  providers: [
    TasksRepository,
    TasksService,
    TaskPlanner,
    TaskDeletion,
    TasksApi,
    TaskRedistribution,
    TaskSwapsRepository,
    TaskSwaps,
    SeriesTopUp,
    { provide: AssignmentStrategy, useClass: LeastLoadRotationStrategy },
  ],
  exports: [TasksApi],
})
export class TasksModule {}
