import {
  APP_URL,
  CLIENT_ID,
  googleClients,
  googleServer,
  idToken,
  oauthError,
  tokenEndpoint,
} from '../../testing/google-http.js';
import { GoogleOAuthSignIn } from './google-oauth-sign-in.js';
import { ParseAuthProvider } from './parse-auth-provider.js';
import { SignInProviders } from './sign-in-providers.js';

const server = googleServer();

const CALLBACK = `${APP_URL}/api/auth/oauth/google/callback`;

function signedIn(answer: Record<string, unknown> | Response) {
  const tokens = tokenEndpoint(() =>
    answer instanceof Response
      ? answer
      : { access_token: 'at', expires_in: 3600, token_type: 'Bearer', ...answer },
  );
  server.use(tokens.handler);
  return tokens;
}

describe('GoogleOAuthSignIn over HTTP', () => {
  const signIn = new GoogleOAuthSignIn(googleClients());

  it('asks only for the identity, and returns to its own callback', () => {
    const url = new URL(signIn.authUrl('state-1'));

    expect(Object.fromEntries(url.searchParams)).toEqual({
      scope: 'openid email profile',
      state: 'state-1',
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: CALLBACK,
    });
  });

  it('reads the profile from the verified ID token', async () => {
    const tokens = signedIn({
      id_token: idToken({
        sub: '1090',
        email: 'Anya@gmail.com',
        name: 'Anya Kovalenko',
        picture: 'https://lh3.googleusercontent.com/a/photo',
      }),
    });

    await expect(signIn.exchange('code-1')).resolves.toEqual({
      subject: '1090',
      email: 'Anya@gmail.com',
      emailVerified: true,
      name: 'Anya Kovalenko',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    });
    expect(tokens.calls).toEqual([
      expect.objectContaining({ grant_type: 'authorization_code', redirect_uri: CALLBACK }),
    ]);
  });

  it('treats a missing verification flag as unverified, and needs an ID token with an email', async () => {
    signedIn({ id_token: idToken({ email_verified: undefined }) });
    await expect(signIn.exchange('code-1')).resolves.toMatchObject({
      emailVerified: false,
      name: '',
      picture: null,
    });

    signedIn({});
    await expect(signIn.exchange('code-1')).rejects.toThrow('no ID token');

    signedIn({ id_token: idToken({ email: undefined }) });
    await expect(signIn.exchange('code-1')).rejects.toThrow('no email');
  });

  it('rejects an expired, foreign or forged ID token, and a used code', async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const forged = `${idToken().split('.').slice(0, 2).join('.')}.${idToken({ sub: 'x' }).split('.')[2]}`;

    for (const [token, reason] of [
      [idToken({ iat: hourAgo - 3600, exp: hourAgo }), 'Token used too late'],
      [idToken({ aud: 'someone-else' }), 'Wrong recipient'],
      [idToken({ iss: 'https://evil.example' }), 'Invalid issuer'],
      [forged, 'Invalid token signature'],
    ] as const) {
      signedIn({ id_token: token });
      // oxlint-disable-next-line no-await-in-loop -- one token endpoint answer per exchange
      await expect(signIn.exchange('code-1')).rejects.toThrow(reason);
    }

    signedIn(oauthError('invalid_grant'));
    await expect(signIn.exchange('code-1')).rejects.toThrow('invalid_grant');
  });

  it('is the adapter registered for google', () => {
    expect(new SignInProviders(signIn).for('google')).toBe(signIn);
    expect(new ParseAuthProvider().transform('google')).toBe('google');
    expect(() => new ParseAuthProvider().transform('me')).toThrow('NOT_FOUND');
  });
});
