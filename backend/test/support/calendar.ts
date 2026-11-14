import {
  CalendarAccessRevoked,
  CalendarGateway,
  type CalendarAccess,
  type CalendarEvent,
} from '../../src/calendar/gateways/calendar-gateway.js';
import { CalendarOAuth, type CalendarGrant } from '../../src/calendar/oauth/calendar-oauth.js';

const noop = (): void => undefined;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = noop;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface FakeCalendar {
  name: string;
  timeZone: string;
  events: Map<string, CalendarEvent>;
}

/** Google Calendar in memory, with an outage (`failNext`), a revoked grant and a slow call */
export class FakeGoogleCalendar extends CalendarGateway {
  readonly calendars = new Map<string, FakeCalendar>();
  readonly revoked = new Set<string>();
  calls = 0;
  private failures = 0;
  private sequence = 0;
  private hold: { gate: Promise<void>; started: () => void } | undefined;

  failNext(count = 1): void {
    this.failures = count;
  }

  revoke(refreshToken: string): void {
    this.revoked.add(refreshToken);
  }

  holdNextUpsert(): { started: Promise<void>; release: () => void } {
    const gate = deferred();
    const started = deferred();
    this.hold = { gate: gate.promise, started: started.resolve };
    return { started: started.promise, release: gate.resolve };
  }

  eventsOf(refreshToken: string): Map<string, CalendarEvent> {
    const calendar = this.calendars.get(this.calendarIdOf(refreshToken) ?? '');
    return calendar?.events ?? new Map<string, CalendarEvent>();
  }

  calendarIdOf(refreshToken: string): string | undefined {
    return [...this.calendars.keys()].find((id) => id.startsWith(`${refreshToken}/`));
  }

  clear(): void {
    this.calendars.clear();
    this.revoked.clear();
    this.calls = 0;
    this.failures = 0;
    this.hold = undefined;
  }

  createCalendar(refreshToken: string, name: string, timeZone: string): Promise<string> {
    this.enter(refreshToken);
    this.sequence += 1;
    const id = `${refreshToken}/${this.sequence}@group.calendar.google.com`;
    this.calendars.set(id, { name, timeZone, events: new Map() });
    return Promise.resolve(id);
  }

  calendarExists(access: CalendarAccess): Promise<boolean> {
    this.enter(access.refreshToken);
    return Promise.resolve(this.calendars.has(access.calendarId));
  }

  deleteCalendar(access: CalendarAccess): Promise<void> {
    this.enter(access.refreshToken);
    this.calendars.delete(access.calendarId);
    return Promise.resolve();
  }

  listEventIds(access: CalendarAccess): Promise<string[]> {
    return Promise.resolve([...this.calendar(access).events.keys()]);
  }

  async upsertEvent(access: CalendarAccess, eventId: string, event: CalendarEvent): Promise<void> {
    const calendar = this.calendar(access);
    const hold = this.hold;
    if (hold) {
      this.hold = undefined;
      hold.started();
      await hold.gate;
    }
    calendar.events.set(eventId, event);
  }

  deleteEvent(access: CalendarAccess, eventId: string): Promise<void> {
    this.calendar(access).events.delete(eventId);
    return Promise.resolve();
  }

  private calendar(access: CalendarAccess): FakeCalendar {
    this.enter(access.refreshToken);
    const calendar = this.calendars.get(access.calendarId);
    if (!calendar) throw Object.assign(new Error('Not Found'), { status: 404 });
    return calendar;
  }

  private enter(refreshToken: string): void {
    this.calls += 1;
    if (this.revoked.has(refreshToken)) throw new CalendarAccessRevoked();
    if (this.failures === 0) return;
    this.failures -= 1;
    throw new Error('503 Service Unavailable');
  }
}

/** The code is the Google account: "anya" → anya@gmail.com */
export class FakeCalendarOAuth extends CalendarOAuth {
  readonly revokedTokens: string[] = [];

  get configured(): boolean {
    return true;
  }

  authUrl(state: string): string {
    return `https://accounts.google.test/o/oauth2/auth?state=${encodeURIComponent(state)}`;
  }

  exchange(code: string): Promise<CalendarGrant> {
    return Promise.resolve({ refreshToken: `rt-${code}`, email: `${code}@gmail.com` });
  }

  revoke(refreshToken: string): Promise<void> {
    this.revokedTokens.push(refreshToken);
    return Promise.resolve();
  }

  clear(): void {
    this.revokedTokens.length = 0;
  }
}
