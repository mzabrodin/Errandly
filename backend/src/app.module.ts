import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/index.js';
import { CalendarModule } from './calendar/index.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './db/database.module.js';
import { GroupsModule } from './groups/index.js';
import { HealthModule } from './health/index.js';
import { LoggerModule } from './logger/logger.module.js';
import { MailModule } from './mail/index.js';
import { NotificationsModule } from './notifications/index.js';
import { StatsModule } from './stats/index.js';
import { TasksModule } from './tasks/index.js';
import { UsersModule } from './users/index.js';

/**
 * A modular monolith (docs/architecture.md): infrastructure first, then the business modules.
 * Modules talk through each other's public API (index.ts) and through events.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    CommonModule,
    HealthModule,
    MailModule,
    UsersModule,
    AuthModule,
    GroupsModule,
    TasksModule,
    CalendarModule,
    NotificationsModule,
    StatsModule,
  ],
})
export class AppModule {}
