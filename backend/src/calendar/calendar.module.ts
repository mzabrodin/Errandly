import { Module } from '@nestjs/common';

import { CalendarController } from './calendar.controller.js';
import { CalendarGateways } from './gateways/calendar-gateways.js';
import { GoogleCalendarGateway } from './gateways/google-calendar.gateway.js';

@Module({
  controllers: [CalendarController],
  providers: [GoogleCalendarGateway, CalendarGateways],
})
export class CalendarModule {}
