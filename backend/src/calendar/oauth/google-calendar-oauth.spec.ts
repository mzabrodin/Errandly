import type { GoogleClients } from '../google/google-clients.js';
import { CALENDAR_SCOPE, GoogleCalendarOAuth } from './google-calendar-oauth.js';

function setup(tokens: Record<string, unknown>, revokeError?: unknown) {
  const options: Record<string, unknown>[] = [];
  const client = {
    generateAuthUrl: (opts: Record<string, unknown>) => {
      options.push(opts);
      return 'https://accounts.google.com/o/oauth2/v2/auth?…';
    },
    getToken: () => Promise.resolve({ tokens }),
    verifyIdToken: () => Promise.resolve({ getPayload: () => ({ email: 'anya@gmail.com' }) }),
    revokeToken: () =>
      revokeError === undefined ? Promise.resolve({}) : Promise.reject(revokeError),
  };
  const clients = {
    configured: true,
    audience: 'client-id',
    client: () => client,
  } as unknown as GoogleClients;
  return { oauth: new GoogleCalendarOAuth(clients), options };
}

const GRANTED = {
  scope: `openid ${CALENDAR_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
  refresh_token: 'rt',
  id_token: 'id',
};

describe('GoogleCalendarOAuth', () => {
  it('asks offline access to Errandly-made calendars only, every time', () => {
    const { oauth, options } = setup(GRANTED);

    oauth.authUrl('state');

    expect(options).toEqual([
      {
        access_type: 'offline',
        prompt: 'consent',
        scope: ['openid', 'email', CALENDAR_SCOPE],
        state: 'state',
      },
    ]);
  });

  it('trades the code for a refresh token and the account email', async () => {
    const { oauth } = setup(GRANTED);

    expect(await oauth.exchange('code')).toEqual({ refreshToken: 'rt', email: 'anya@gmail.com' });
  });

  it('rejects a consent where the calendar box was unticked', async () => {
    const { oauth } = setup({ ...GRANTED, scope: 'openid email' });

    await expect(oauth.exchange('code')).rejects.toThrow('Calendar access was not granted');
  });

  it('treats an already revoked token as revoked', async () => {
    const gone = Object.assign(new Error('invalid_token'), { response: { status: 400 } });

    await expect(setup(GRANTED, gone).oauth.revoke('rt')).resolves.toBeUndefined();
    await expect(setup(GRANTED, new Error('offline')).oauth.revoke('rt')).rejects.toThrow(
      'offline',
    );
  });
});
