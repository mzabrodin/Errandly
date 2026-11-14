import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/index.js';
import { TasksModule } from '../tasks/index.js';
import { StatsController } from './stats.controller.js';
import { StatsService } from './stats.service.js';

@Module({
  imports: [GroupsModule, TasksModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
