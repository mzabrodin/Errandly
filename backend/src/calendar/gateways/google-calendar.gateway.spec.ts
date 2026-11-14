import type { GoogleClients } from '../google/google-clients.js';
import { CalendarAccessRevoked, type CalendarEvent } from './calendar-gateway.js';
import { GoogleCalendarGateway } from './google-calendar.gateway.js';

interface Request {
  url: string;
  method: string;
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

function httpError(status: number, data?: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, response: { status, data } });
}

function setup(answers: ((request: Request) => unknown)[]) {
  const requests: Request[] = [];
  const request = vi.fn<(options: Request) => Promise<{ data: unknown }>>((options) => {
    requests.push(options);
    const answer = answers.shift();
    try {
      return Promise.resolve({ data: answer?.(options) });
    } catch (error) {
      return Promise.reject(error);
    }
  });
  const clients = { client: () => ({ request }) } as unknown as GoogleClients;
  return { gateway: new GoogleCalendarGateway(clients), requests };
}

const ACCESS = { calendarId: 'abc@group.calendar.google.com', refreshToken: 'rt' };
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/abc%40group.calendar.google.com';
const EVENT: CalendarEvent = {
  title: 'Trash',
  description: 'link',
  start: new Date('2026-11-20T18:00:00Z'),
  end: new Date('2026-11-20T18:30:00Z'),
  timeZone: 'Europe/Kyiv',
  reminderMinutes: 60,
  url: 'https://errandly.app/g/1/tasks/2',
};

describe('GoogleCalendarGateway', () => {
  it('replaces the event by its id and creates it when Google does not know it yet', async () => {
    const { gateway, requests } = setup([
      () => {
        throw httpError(404);
      },
      () => ({}),
    ]);

    await gateway.upsertEvent(ACCESS, 'e1', EVENT);

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `PUT ${CALENDAR}/events/e1`,
      `POST ${CALENDAR}/events`,
    ]);
    expect(requests[1]?.data).toMatchObject({
      id: 'e1',
      summary: 'Trash',
      start: { dateTime: '2026-11-20T18:00:00.000Z', timeZone: 'Europe/Kyiv' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
    });
  });

  it('treats an already deleted event or calendar as done', async () => {
    const { gateway } = setup([
      () => {
        throw httpError(410);
      },
      () => {
        throw httpError(404);
      },
    ]);

    await expect(gateway.deleteEvent(ACCESS, 'e1')).resolves.toBeUndefined();
    await expect(gateway.deleteCalendar(ACCESS)).resolves.toBeUndefined();
  });

  it('turns a revoked grant into CalendarAccessRevoked and keeps other errors', async () => {
    const { gateway } = setup([
      () => {
        throw httpError(400, { error: 'invalid_grant' });
      },
      () => {
        throw httpError(503);
      },
    ]);

    await expect(gateway.deleteEvent(ACCESS, 'e1')).rejects.toBeInstanceOf(CalendarAccessRevoked);
    await expect(gateway.deleteEvent(ACCESS, 'e1')).rejects.toThrow('HTTP 503');
  });

  it('reads every page of event ids', async () => {
    const { gateway, requests } = setup([
      () => ({ items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' }),
      () => ({ items: [{ id: 'c' }] }),
    ]);

    expect(await gateway.listEventIds(ACCESS)).toEqual(['a', 'b', 'c']);
    expect(requests[1]?.params).toMatchObject({ pageToken: 'p2' });
  });

  it('tells whether the Errandly calendar still exists, and creates one', async () => {
    const { gateway } = setup([
      () => ({}),
      () => {
        throw httpError(404);
      },
      () => ({ id: 'new@group.calendar.google.com' }),
    ]);

    expect(await gateway.calendarExists(ACCESS)).toBe(true);
    expect(await gateway.calendarExists(ACCESS)).toBe(false);
    expect(await gateway.createCalendar('rt', 'Errandly', 'Europe/Kyiv')).toBe(
      'new@group.calendar.google.com',
    );
  });
});
