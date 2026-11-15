import { http, HttpResponse } from 'msw';

import { httpStatus } from '../../common/google/google-clients.js';
import {
  APP_URL,
  CLIENT_ID,
  googleClients,
  googleServer,
  idToken,
  oauthError,
  REVOKE_URL,
  tokenEndpoint,
} from '../../testing/google-http.js';
import { CALENDAR_SCOPE, GoogleCalendarOAuth } from './google-calendar-oauth.js';

const server = googleServer();

const GRANTED = {
  access_token: 'at',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: `openid ${CALENDAR_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
  refresh_token: 'rt-anya',
};

function grant(answer: Record<string, unknown> | Response) {
  const tokens = tokenEndpoint(() => answer);
  server.use(tokens.handler);
  return tokens;
}

describe('GoogleCalendarOAuth over HTTP', () => {
  const oauth = new GoogleCalendarOAuth(googleClients());

  it('asks offline access to Errandly-made calendars only, every time', () => {
    const url = new URL(oauth.authUrl('state-1'));

    expect(Object.fromEntries(url.searchParams)).toEqual({
      access_type: 'offline',
      prompt: 'consent',
      scope: `openid email ${CALENDAR_SCOPE}`,
      state: 'state-1',
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: `${APP_URL}/api/me/calendar/callback`,
    });
  });

  it('trades the code for a refresh token and the account email', async () => {
    const tokens = grant({ ...GRANTED, id_token: idToken() });

    await expect(oauth.exchange('code-1')).resolves.toEqual({
      refreshToken: 'rt-anya',
      email: 'anya@gmail.com',
    });
    expect(tokens.calls).toEqual([
      expect.objectContaining({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: `${APP_URL}/api/me/calendar/callback`,
      }),
    ]);
  });

  it('rejects a consent where the calendar box was unticked', async () => {
    grant({ ...GRANTED, scope: 'openid email', id_token: idToken() });

    await expect(oauth.exchange('code-1')).rejects.toThrow('Calendar access was not granted');
  });

  it('rejects an ID token issued to another app, and a used code', async () => {
    grant({ ...GRANTED, id_token: idToken({ aud: 'someone-else' }) });
    await expect(oauth.exchange('code-1')).rejects.toThrow('Wrong recipient');

    grant(oauthError('invalid_grant'));
    await expect(oauth.exchange('code-1')).rejects.toThrow('invalid_grant');
  });

  it('treats an already revoked token as revoked, and passes other failures on', async () => {
    server.use(http.post(REVOKE_URL, () => oauthError('invalid_token')));
    await expect(oauth.revoke('rt-anya')).resolves.toBeUndefined();

    server.use(http.post(REVOKE_URL, () => new HttpResponse(null, { status: 503 })));
    const error: unknown = await oauth.revoke('rt-anya').catch((caught: unknown) => caught);
    expect(httpStatus(error)).toBe(503);
  });
});
