import { OAuthSignIn, type OAuthProfile } from '../../src/auth/oauth/oauth-sign-in.js';

/** Google sign-in without Google: the code is the account, "anya" → anya@gmail.com */
export class FakeOAuthSignIn extends OAuthSignIn {
  readonly provider = 'google';
  readonly unverified = new Set<string>();

  get configured(): boolean {
    return true;
  }

  authUrl(state: string): string {
    return `https://accounts.google.test/o/oauth2/auth?state=${encodeURIComponent(state)}`;
  }

  exchange(code: string): Promise<OAuthProfile> {
    return Promise.resolve({
      subject: `sub-${code}`,
      email: `${code}@gmail.com`,
      emailVerified: !this.unverified.has(code),
      name: `${code} Google`,
      picture: `https://lh3.googleusercontent.test/${code}`,
    });
  }

  clear(): void {
    this.unverified.clear();
  }
}
