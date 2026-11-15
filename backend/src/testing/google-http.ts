import { createSign, generateKeyPairSync } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';

import { GoogleClients } from '../common/google/google-clients.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

export const CLIENT_ID = 'errandly-test.apps.googleusercontent.com';
export const APP_URL = 'http://localhost:5173';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs';

const KEY_ID = 'test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export function googleClients(): GoogleClients {
  const env: Partial<EnvironmentVariables> = {
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'test-secret',
    APP_URL,
  };
  const config = {
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new GoogleClients(config);
}

const base64Url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export function idToken(claims: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'anya@gmail.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const signed = `${base64Url({ alg: 'RS256', kid: KEY_ID, typ: 'JWT' })}.${base64Url(payload)}`;
  const signature = createSign('RSA-SHA256').update(signed).sign(privateKey, 'base64url');
  return `${signed}.${signature}`;
}

export interface TokenRequest {
  grant_type: string | null;
  code: string | null;
  refresh_token: string | null;
  redirect_uri: string | null;
}

export function tokenEndpoint(answer: (form: TokenRequest) => Response | Record<string, unknown>): {
  handler: HttpHandler;
  calls: TokenRequest[];
} {
  const calls: TokenRequest[] = [];
  const handler = http.post(TOKEN_URL, async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    const call: TokenRequest = {
      grant_type: form.get('grant_type'),
      code: form.get('code'),
      refresh_token: form.get('refresh_token'),
      redirect_uri: form.get('redirect_uri'),
    };
    calls.push(call);
    const result = answer(call);
    return result instanceof Response ? result : HttpResponse.json(result);
  });
  return { handler, calls };
}

export function oauthError(error: string, status = 400): Response {
  return HttpResponse.json({ error, error_description: error }, { status });
}

const certs = http.get(CERTS_URL, () =>
  HttpResponse.json(
    { [KEY_ID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  ),
);

export function googleServer(): ReturnType<typeof setupServer> {
  const server = setupServer(certs);
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers(certs));
  afterAll(() => server.close());
  return server;
}
