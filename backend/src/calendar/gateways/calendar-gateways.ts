import { Injectable } from '@nestjs/common';

import type { CalendarProvider } from '../../common/domain.js';
import type { CalendarGateway } from './calendar-gateway.js';
import { GoogleCalendarGateway } from './google-calendar.gateway.js';

/** A new CALENDAR_PROVIDERS value fails to compile until its gateway exists */
@Injectable()
export class CalendarGateways {
  private readonly gateways: Record<CalendarProvider, CalendarGateway>;

  constructor(google: GoogleCalendarGateway) {
    this.gateways = { google };
  }

  for(provider: CalendarProvider): CalendarGateway {
    return this.gateways[provider];
  }
}
