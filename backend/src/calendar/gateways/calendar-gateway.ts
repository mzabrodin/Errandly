import type { CalendarConnectionRow } from '../calendar.schema.js';

export interface CalendarEvent {
  title: string;
  description: string;
  start: Date;
  end: Date;
  url: string;
}

export abstract class CalendarGateway {
  /** Updates the event when `externalEventId` is set */
  abstract upsertEvent(
    connection: CalendarConnectionRow,
    event: CalendarEvent,
    externalEventId: string | null,
  ): Promise<string>;

  /** An already missing event is not an error */
  abstract deleteEvent(connection: CalendarConnectionRow, externalEventId: string): Promise<void>;
}
