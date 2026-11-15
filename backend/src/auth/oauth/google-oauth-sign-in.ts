import { Injectable } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';

import { GoogleClients } from '../../common/google/google-clients.js';
import { OAuthSignIn, signInCallbackPath, type OAuthProfile } from './oauth-sign-in.js';

const SCOPES = ['openid', 'email', 'profile'];

@Injectable()
export class GoogleOAuthSignIn extends OAuthSignIn {
  readonly provider = 'google';

  constructor(private readonly google: GoogleClients) {
    super();
  }

  get configured(): boolean {
    return this.google.configured;
  }

  authUrl(state: string): string {
    return this.client().generateAuthUrl({ scope: SCOPES, state });
  }

  async exchange(code: string): Promise<OAuthProfile> {
    const client = this.client();
    const { tokens } = await client.getToken(code);
    if (typeof tokens.id_token !== 'string') throw new Error('Google returned no ID token');
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.google.audience,
    });
    const payload = ticket.getPayload();
    if (payload?.email === undefined) throw new Error('The ID token carries no email');
    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? '',
      picture: payload.picture ?? null,
    };
  }

  private client(): OAuth2Client {
    return this.google.oauthClient(signInCallbackPath(this.provider));
  }
}
