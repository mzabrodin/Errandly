import { Injectable } from '@nestjs/common';

import type { AuthProvider } from '../../common/domain.js';
import { GoogleOAuthSignIn } from './google-oauth-sign-in.js';
import type { OAuthSignIn } from './oauth-sign-in.js';

/** A new provider in AUTH_PROVIDERS does not compile until its adapter is registered here */
@Injectable()
export class SignInProviders {
  private readonly providers: Record<AuthProvider, OAuthSignIn>;

  constructor(google: GoogleOAuthSignIn) {
    this.providers = { google };
  }

  for(provider: AuthProvider): OAuthSignIn {
    return this.providers[provider];
  }
}
