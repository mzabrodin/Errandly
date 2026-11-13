import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/index.js';
import { UsersModule } from '../users/index.js';
import { AssignmentStrategy } from './assignment/assignment-strategy.js';
import { LeastLoadRotationStrategy } from './assignment/least-load-rotation.strategy.js';
import { SeriesTopUp } from './series-top-up.js';
import { TaskPlanner } from './task-planner.js';
import { TaskRedistribution } from './task-redistribution.js';
import { TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [GroupsModule, UsersModule],
  controllers: [TasksController],
  providers: [
    TasksRepository,
    TasksService,
    TaskPlanner,
    TaskRedistribution,
    SeriesTopUp,
    { provide: AssignmentStrategy, useClass: LeastLoadRotationStrategy },
  ],
})
export class TasksModule {}
