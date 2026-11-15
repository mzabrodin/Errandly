import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { Clock, SystemClock } from './clock.js';
import { TokenCipher } from './crypto/token-cipher.js';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';
import { EventBus } from './events/event-bus.js';
import { EventDispatcher } from './events/event-dispatcher.js';
import { EventPublicationStore } from './events/event-publication.store.js';
import { GoogleClients } from './google/google-clients.js';
import { rateLimits } from './http/rate-limit.js';
import { ObjectStorage } from './storage/object-storage.js';
import { S3ObjectStorage } from './storage/s3-object-storage.js';

/** Needs DatabaseModule and ScheduleModule */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        rateLimits(
          config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
          config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true }),
        ),
    }),
  ],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: ObjectStorage, useClass: S3ObjectStorage },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    EventPublicationStore,
    EventBus,
    EventDispatcher,
    TokenCipher,
    GoogleClients,
  ],
  exports: [Clock, EventBus, EventPublicationStore, GoogleClients, ObjectStorage, TokenCipher],
})
export class CommonModule {}
