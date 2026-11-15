import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { appLink } from '../../config/urls.js';

/** One OAuth client for Google sign-in and the calendar; each flow has its own redirect URI */
@Injectable()
export class GoogleClients {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly appUrl: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  get configured(): boolean {
    return this.clientId !== undefined && this.clientSecret !== undefined;
  }

  get audience(): string {
    if (this.clientId === undefined) throw new Error('GOOGLE_CLIENT_ID is not set');
    return this.clientId;
  }

  /** `callbackPath` is the API path Google redirects back to, e.g. /api/auth/google/callback */
  oauthClient(callbackPath: string): OAuth2Client {
    return this.create(appLink(this.appUrl, callbackPath));
  }

  /** For API calls on the user's behalf */
  client(refreshToken: string): OAuth2Client {
    const client = this.create(undefined);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  private create(redirectUri: string | undefined): OAuth2Client {
    if (!this.configured) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set');
    return new OAuth2Client({
      ...(this.clientId !== undefined && { clientId: this.clientId }),
      ...(this.clientSecret !== undefined && { clientSecret: this.clientSecret }),
      ...(redirectUri !== undefined && { redirectUri }),
    });
  }
}

export function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if (!('response' in error) || typeof error.response !== 'object' || error.response === null) {
    return undefined;
  }
  return 'status' in error.response && typeof error.response.status === 'number'
    ? error.response.status
    : undefined;
}

export function oauthError(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;
  const { response } = error;
  if (typeof response !== 'object' || response === null || !('data' in response)) return undefined;
  const { data } = response;
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined;
  return typeof data.error === 'string' ? data.error : undefined;
}
