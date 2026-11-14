import { Injectable } from '@nestjs/common';

import { GoogleClients, httpStatus } from '../google/google-clients.js';
import { CalendarOAuth, type CalendarGrant } from './calendar-oauth.js';

/** Least privilege (NFR-SEC-05) */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const SCOPES = ['openid', 'email', CALENDAR_SCOPE];

@Injectable()
export class GoogleCalendarOAuth extends CalendarOAuth {
  constructor(private readonly google: GoogleClients) {
    super();
  }

  get configured(): boolean {
    return this.google.configured;
  }

  authUrl(state: string): string {
    return this.google.client().generateAuthUrl({
      // Google issues a refresh token only with a fresh consent
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
  }

  async exchange(code: string): Promise<CalendarGrant> {
    const client = this.google.client();
    const { tokens } = await client.getToken(code);
    // The consent screen lets the user untick the calendar
    const granted = (tokens.scope ?? '').split(' ');
    if (!granted.includes(CALENDAR_SCOPE)) throw new Error('Calendar access was not granted');
    if (typeof tokens.refresh_token !== 'string' || typeof tokens.id_token !== 'string') {
      throw new Error('Google returned no refresh token or ID token');
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.google.audience,
    });
    const email = ticket.getPayload()?.email;
    if (email === undefined) throw new Error('The ID token carries no email');
    return { refreshToken: tokens.refresh_token, email };
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.google.client().revokeToken(refreshToken);
    } catch (error) {
      // 400: already revoked in the Google account
      if (httpStatus(error) !== 400) throw error;
    }
  }
}
