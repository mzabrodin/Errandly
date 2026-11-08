import { Injectable } from '@nestjs/common';

import type { CalendarConnectionRow } from '../calendar.schema.js';
import { CalendarGateway, type CalendarEvent } from './calendar-gateway.js';

/** Google Calendar API v3 (SYS-18–20). To be implemented with the calendar feature. */
@Injectable()
export class GoogleCalendarGateway extends CalendarGateway {
  upsertEvent(
    _connection: CalendarConnectionRow,
    _event: CalendarEvent,
    _externalEventId: string | null,
  ): Promise<string> {
    return Promise.reject(new Error('Google Calendar sync is not implemented yet'));
  }

  deleteEvent(_connection: CalendarConnectionRow, _externalEventId: string): Promise<void> {
    return Promise.reject(new Error('Google Calendar sync is not implemented yet'));
  }
}
