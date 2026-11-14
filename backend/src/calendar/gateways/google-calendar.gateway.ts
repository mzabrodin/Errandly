import { Injectable } from '@nestjs/common';

import { GoogleClients, httpStatus, oauthError } from '../google/google-clients.js';
import {
  CalendarAccessRevoked,
  CalendarGateway,
  type CalendarAccess,
  type CalendarEvent,
} from './calendar-gateway.js';

const API = 'https://www.googleapis.com/calendar/v3';
// The dispatcher delivers one event at a time, so a hanging call would hold the rest
const TIMEOUT_MS = 10_000;
const PAGE_SIZE = 2500;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface EventList {
  items?: { id?: string }[];
  nextPageToken?: string;
}

@Injectable()
export class GoogleCalendarGateway extends CalendarGateway {
  constructor(private readonly google: GoogleClients) {
    super();
  }

  async createCalendar(refreshToken: string, name: string, timeZone: string): Promise<string> {
    const calendar = await this.call<{ id: string }>(refreshToken, 'POST', '/calendars', {
      summary: name,
      timeZone,
    });
    return calendar.id;
  }

  async calendarExists(access: CalendarAccess): Promise<boolean> {
    try {
      await this.call(access.refreshToken, 'GET', calendarPath(access));
      return true;
    } catch (error) {
      if (isGone(error)) return false;
      throw error;
    }
  }

  async deleteCalendar(access: CalendarAccess): Promise<void> {
    await this.ignoreGone(this.call(access.refreshToken, 'DELETE', calendarPath(access)));
  }

  async listEventIds(access: CalendarAccess): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      // oxlint-disable-next-line no-await-in-loop -- each page needs the token of the previous one
      const page: EventList = await this.call<EventList>(
        access.refreshToken,
        'GET',
        `${calendarPath(access)}/events`,
        undefined,
        {
          maxResults: PAGE_SIZE,
          fields: 'items(id),nextPageToken',
          ...(pageToken !== undefined && { pageToken }),
        },
      );
      for (const item of page.items ?? []) if (item.id !== undefined) ids.push(item.id);
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return ids;
  }

  // PUT also restores an event deleted before, so it stays one event
  async upsertEvent(access: CalendarAccess, eventId: string, event: CalendarEvent): Promise<void> {
    const body = { id: eventId, ...toGoogleEvent(event) };
    try {
      await this.call(access.refreshToken, 'PUT', eventPath(access, eventId), body);
    } catch (error) {
      if (httpStatus(error) !== 404) throw error;
      await this.call(access.refreshToken, 'POST', `${calendarPath(access)}/events`, body);
    }
  }

  async deleteEvent(access: CalendarAccess, eventId: string): Promise<void> {
    await this.ignoreGone(this.call(access.refreshToken, 'DELETE', eventPath(access, eventId)));
  }

  private async ignoreGone(call: Promise<unknown>): Promise<void> {
    try {
      await call;
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  }

  // oxlint-disable-next-line max-params -- a thin wrapper over one HTTP request
  private async call<T = unknown>(
    refreshToken: string,
    method: Method,
    path: string,
    data?: object,
    params?: Record<string, string | number>,
  ): Promise<T> {
    try {
      const response = await this.google.client(refreshToken).request<T>({
        url: `${API}${path}`,
        method,
        timeout: TIMEOUT_MS,
        ...(data !== undefined && { data }),
        ...(params !== undefined && { params }),
      });
      return response.data;
    } catch (error) {
      if (oauthError(error) === 'invalid_grant' || httpStatus(error) === 401) {
        throw new CalendarAccessRevoked();
      }
      throw error;
    }
  }
}

function isGone(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 404 || status === 410;
}

function calendarPath(access: CalendarAccess): string {
  return `/calendars/${encodeURIComponent(access.calendarId)}`;
}

function eventPath(access: CalendarAccess, eventId: string): string {
  return `${calendarPath(access)}/events/${encodeURIComponent(eventId)}`;
}

function toGoogleEvent(event: CalendarEvent) {
  return {
    summary: event.title,
    description: event.description,
    start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
    end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
    status: 'confirmed',
    transparency: 'transparent',
    reminders: {
      useDefault: false,
      overrides:
        event.reminderMinutes === null ? [] : [{ method: 'popup', minutes: event.reminderMinutes }],
    },
    source: { title: 'Errandly', url: event.url },
  };
}
