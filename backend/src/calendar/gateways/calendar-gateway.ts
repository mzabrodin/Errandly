import type { CalendarConnectionRow } from '../calendar.schema.js';

/** What Errandly writes into an external calendar for one task instance */
export interface CalendarEvent {
  title: string;
  description: string;
  start: Date;
  end: Date;
  /** Link back to the task page */
  url: string;
}

/**
 * Port to an external calendar API (ПР6: CalendarGateway). The sync service talks only to this,
 * so it is testable without the network, and Outlook or Apple is a new implementation.
 */
export abstract class CalendarGateway {
  /** Creates the event, or updates it when `externalEventId` is set; returns the event id */
  abstract upsertEvent(
    connection: CalendarConnectionRow,
    event: CalendarEvent,
    externalEventId: string | null,
  ): Promise<string>;

  /** Deletes an event Errandly created; an already missing event is not an error */
  abstract deleteEvent(connection: CalendarConnectionRow, externalEventId: string): Promise<void>;
}
