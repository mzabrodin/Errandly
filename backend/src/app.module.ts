import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation.js';
import { HealthController } from './health/health.controller.js';
import { LoggerModule } from './logger/logger.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), LoggerModule],
  controllers: [HealthController],
})
export class AppModule {}
