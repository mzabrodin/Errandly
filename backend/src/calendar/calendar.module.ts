import { Module } from '@nestjs/common';

import { TasksModule } from '../tasks/index.js';
import { UsersModule } from '../users/index.js';
import { CalendarApi } from './calendar-api.js';
import { CalendarSync } from './calendar-sync.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarRepository } from './calendar.repository.js';
import { CalendarService } from './calendar.service.js';
import { CalendarGateways } from './gateways/calendar-gateways.js';
import { GoogleCalendarGateway } from './gateways/google-calendar.gateway.js';
import { GoogleClients } from './google/google-clients.js';
import { CalendarOAuth } from './oauth/calendar-oauth.js';
import { GoogleCalendarOAuth } from './oauth/google-calendar-oauth.js';

@Module({
  imports: [TasksModule, UsersModule],
  controllers: [CalendarController],
  providers: [
    CalendarRepository,
    CalendarApi,
    CalendarService,
    CalendarSync,
    GoogleClients,
    GoogleCalendarGateway,
    CalendarGateways,
    { provide: CalendarOAuth, useClass: GoogleCalendarOAuth },
  ],
  exports: [CalendarApi],
})
export class CalendarModule {}
