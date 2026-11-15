import type { GoogleClients } from '../../common/google/google-clients.js';
import { GoogleOAuthSignIn } from './google-oauth-sign-in.js';
import { ParseAuthProvider } from './parse-auth-provider.js';
import { SignInProviders } from './sign-in-providers.js';

const PAYLOAD = {
  sub: '1090',
  email: 'Anya@gmail.com',
  email_verified: true,
  name: 'Anya Kovalenko',
  picture: 'https://lh3.googleusercontent.com/a/photo',
};

function setup(tokens: Record<string, unknown>, payload: Record<string, unknown> = PAYLOAD) {
  const redirects: string[] = [];
  const options: Record<string, unknown>[] = [];
  const client = {
    generateAuthUrl: (opts: Record<string, unknown>) => {
      options.push(opts);
      return 'https://accounts.google.com/o/oauth2/v2/auth?…';
    },
    getToken: () => Promise.resolve({ tokens }),
    verifyIdToken: () => Promise.resolve({ getPayload: () => payload }),
  };
  const clients = {
    configured: true,
    audience: 'client-id',
    oauthClient: (callbackPath: string) => {
      redirects.push(callbackPath);
      return client;
    },
  } as unknown as GoogleClients;
  return { signIn: new GoogleOAuthSignIn(clients), options, redirects };
}

describe('GoogleOAuthSignIn', () => {
  it('asks only for the identity, and returns to its own callback', () => {
    const { signIn, options, redirects } = setup({});

    signIn.authUrl('state');

    expect(options).toEqual([{ scope: ['openid', 'email', 'profile'], state: 'state' }]);
    expect(redirects).toEqual(['/api/auth/oauth/google/callback']);
  });

  it('reads the profile from the verified ID token', async () => {
    const { signIn } = setup({ id_token: 'id' });

    expect(await signIn.exchange('code')).toEqual({
      subject: '1090',
      email: 'Anya@gmail.com',
      emailVerified: true,
      name: 'Anya Kovalenko',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    });
  });

  it('treats a missing verification flag as unverified, and needs an ID token with an email', async () => {
    const unverified = setup({ id_token: 'id' }, { sub: '1', email: 'a@b.c' });
    expect(await unverified.signIn.exchange('code')).toMatchObject({
      emailVerified: false,
      name: '',
      picture: null,
    });

    await expect(setup({}).signIn.exchange('code')).rejects.toThrow('no ID token');
    await expect(setup({ id_token: 'id' }, { sub: '1' }).signIn.exchange('code')).rejects.toThrow(
      'no email',
    );
  });

  it('is the adapter registered for google', () => {
    const { signIn } = setup({});

    expect(new SignInProviders(signIn).for('google')).toBe(signIn);
    expect(new ParseAuthProvider().transform('google')).toBe('google');
    expect(() => new ParseAuthProvider().transform('me')).toThrow('NOT_FOUND');
  });
});
