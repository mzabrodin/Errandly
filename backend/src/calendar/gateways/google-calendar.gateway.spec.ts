import { http, HttpResponse } from 'msw';

import { httpStatus } from '../../common/google/google-clients.js';
import {
  CALENDAR_API,
  googleClients,
  googleServer,
  oauthError,
  tokenEndpoint,
} from '../../testing/google-http.js';
import { CalendarAccessRevoked, type CalendarEvent } from './calendar-gateway.js';
import { GoogleCalendarGateway } from './google-calendar.gateway.js';

const server = googleServer();

const ACCESS = { calendarId: 'abc@group.calendar.google.com', refreshToken: 'rt-anya' };
const CALENDAR = `${CALENDAR_API}/calendars/abc%40group.calendar.google.com`;
const EVENT: CalendarEvent = {
  title: 'Trash',
  description: 'link',
  start: new Date('2026-11-20T18:00:00Z'),
  end: new Date('2026-11-20T18:30:00Z'),
  timeZone: 'Europe/Kyiv',
  reminderMinutes: 60,
  url: 'https://errandly.app/g/1/tasks/2',
};

function setup() {
  const tokens = tokenEndpoint(() => ({
    access_token: 'at-1',
    expires_in: 3600,
    token_type: 'Bearer',
  }));
  server.use(tokens.handler);
  return { gateway: new GoogleCalendarGateway(googleClients()), tokens };
}

describe('GoogleCalendarGateway over HTTP', () => {
  it('trades the refresh token for an access token once and sends it on every call', async () => {
    const { gateway, tokens } = setup();
    const seen: { auth: string | null; query: Record<string, string> }[] = [];
    server.use(
      http.get(`${CALENDAR}/events`, ({ request }) => {
        const url = new URL(request.url);
        seen.push({
          auth: request.headers.get('authorization'),
          query: Object.fromEntries(url.searchParams),
        });
        return HttpResponse.json(
          url.searchParams.has('pageToken')
            ? { items: [{ id: 'c' }] }
            : { items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p 2/+' },
        );
      }),
    );

    await expect(gateway.listEventIds(ACCESS)).resolves.toEqual(['a', 'b', 'c']);

    expect(tokens.calls).toEqual([
      expect.objectContaining({ grant_type: 'refresh_token', refresh_token: 'rt-anya' }),
    ]);
    expect(seen).toEqual([
      {
        auth: 'Bearer at-1',
        query: { maxResults: '2500', fields: 'items(id),nextPageToken' },
      },
      {
        auth: 'Bearer at-1',
        query: { maxResults: '2500', fields: 'items(id),nextPageToken', pageToken: 'p 2/+' },
      },
    ]);
  });

  it('replaces the event by its id and creates it when Google does not know it yet', async () => {
    const { gateway } = setup();
    const calls: { method: string; body: unknown }[] = [];
    server.use(
      http.put(`${CALENDAR}/events/e1`, async ({ request }) => {
        calls.push({ method: 'PUT', body: await request.json() });
        return HttpResponse.json({ error: { code: 404 } }, { status: 404 });
      }),
      http.post(`${CALENDAR}/events`, async ({ request }) => {
        calls.push({ method: 'POST', body: await request.json() });
        return HttpResponse.json({ id: 'e1' });
      }),
    );

    await gateway.upsertEvent(ACCESS, 'e1', EVENT);

    expect(calls.map(({ method }) => method)).toEqual(['PUT', 'POST']);
    expect(calls[1]?.body).toMatchObject({
      id: 'e1',
      summary: 'Trash',
      start: { dateTime: '2026-11-20T18:00:00.000Z', timeZone: 'Europe/Kyiv' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
      source: { title: 'Errandly', url: 'https://errandly.app/g/1/tasks/2' },
    });
  });

  it('treats an already deleted event or calendar as done', async () => {
    const { gateway } = setup();
    server.use(
      http.delete(`${CALENDAR}/events/e1`, () => new HttpResponse(null, { status: 410 })),
      http.delete(CALENDAR, () => new HttpResponse(null, { status: 404 })),
    );

    await expect(gateway.deleteEvent(ACCESS, 'e1')).resolves.toBeUndefined();
    await expect(gateway.deleteCalendar(ACCESS)).resolves.toBeUndefined();
  });

  it('turns a revoked grant into CalendarAccessRevoked', async () => {
    const gateway = new GoogleCalendarGateway(googleClients());
    server.use(tokenEndpoint(() => oauthError('invalid_grant')).handler);

    await expect(gateway.deleteEvent(ACCESS, 'e1')).rejects.toBeInstanceOf(CalendarAccessRevoked);
  });

  it('turns a rejected access token into CalendarAccessRevoked after one refresh', async () => {
    const { gateway, tokens } = setup();
    server.use(http.get(CALENDAR, () => new HttpResponse(null, { status: 401 })));

    await expect(gateway.calendarExists(ACCESS)).rejects.toBeInstanceOf(CalendarAccessRevoked);
    expect(tokens.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('passes a server error on with its status, for the dispatcher to retry', async () => {
    const { gateway } = setup();
    server.use(http.delete(`${CALENDAR}/events/e1`, () => new HttpResponse(null, { status: 503 })));

    const error: unknown = await gateway
      .deleteEvent(ACCESS, 'e1')
      .catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(CalendarAccessRevoked);
    expect(httpStatus(error)).toBe(503);
  });

  it('tells whether the Errandly calendar still exists, and creates one', async () => {
    const { gateway } = setup();
    let exists = true;
    server.use(
      http.get(CALENDAR, () =>
        exists
          ? HttpResponse.json({ id: ACCESS.calendarId })
          : new HttpResponse(null, { status: 404 }),
      ),
      http.post(`${CALENDAR_API}/calendars`, async ({ request }) =>
        HttpResponse.json({ id: 'new@group.calendar.google.com', echo: await request.json() }),
      ),
    );

    expect(await gateway.calendarExists(ACCESS)).toBe(true);
    exists = false;
    expect(await gateway.calendarExists(ACCESS)).toBe(false);
    expect(await gateway.createCalendar('rt-anya', 'Errandly', 'Europe/Kyiv')).toBe(
      'new@group.calendar.google.com',
    );
  });
});
