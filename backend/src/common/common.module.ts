import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { Clock, SystemClock } from './clock.js';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';
import { EventBus } from './events/event-bus.js';
import { EventDispatcher } from './events/event-dispatcher.js';
import { EventPublicationStore } from './events/event-publication.store.js';

/**
 * Shared kernel available to every module: the clock, the event bus and the global
 * exception handler. Needs DatabaseModule and ScheduleModule.
 */
@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    EventPublicationStore,
    EventBus,
    EventDispatcher,
  ],
  exports: [Clock, EventBus],
})
export class CommonModule {}
