export interface CalendarAccess {
  calendarId: string;
  refreshToken: string;
}

export interface CalendarEvent {
  title: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
  reminderMinutes: number | null;
  url: string;
}

/** Retrying cannot help; reconnecting can */
export class CalendarAccessRevoked extends Error {
  constructor(message = 'Calendar access was revoked') {
    super(message);
    this.name = 'CalendarAccessRevoked';
  }
}

/** Works only inside the calendar Errandly created, so other events are never touched (FR-36) */
export abstract class CalendarGateway {
  abstract createCalendar(refreshToken: string, name: string, timeZone: string): Promise<string>;

  abstract calendarExists(access: CalendarAccess): Promise<boolean>;

  /** A missing calendar is not an error */
  abstract deleteCalendar(access: CalendarAccess): Promise<void>;

  abstract listEventIds(access: CalendarAccess): Promise<string[]>;

  abstract upsertEvent(
    access: CalendarAccess,
    eventId: string,
    event: CalendarEvent,
  ): Promise<void>;

  /** A missing event is not an error */
  abstract deleteEvent(access: CalendarAccess, eventId: string): Promise<void>;
}
