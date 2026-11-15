import type { AuthProvider } from '../../common/domain.js';
import { API_PREFIX } from '../../config/urls.js';

/** Who the provider says signed in, from its verified ID token or user info */
export interface OAuthProfile {
  /** Stable account id at the provider (`sub` for OpenID Connect) */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/** Sign-in only; a calendar permission is a separate flow (SYS-06) */
export abstract class OAuthSignIn {
  abstract readonly provider: AuthProvider;

  abstract get configured(): boolean;

  abstract authUrl(state: string): string;

  abstract exchange(code: string): Promise<OAuthProfile>;
}

/** Where the provider sends the browser back; register it in the provider's console */
export function signInCallbackPath(provider: AuthProvider): string {
  return `/${API_PREFIX}/auth/oauth/${provider}/callback`;
}
