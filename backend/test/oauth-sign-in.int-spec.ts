import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';

import { authIdentities, passwordCredentials } from '../src/auth/auth.schema.js';
import { users } from '../src/users/users.schema.js';
import { createUser, PASSWORD, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const FAILED = '/login?oauthError=google';

/** Start in this browser, consent at Google as `account`, come back; returns the redirect */
async function google(
  agent: TestAgent,
  account: string,
  query: Record<string, string> = {},
  callbackAgent: TestAgent = agent,
): Promise<string> {
  const start = await agent.get('/api/auth/oauth/google').query(query).expect(302);
  const state = new URL(start.headers['location'] ?? '').searchParams.get('state') ?? '';
  const callback = await callbackAgent
    .get('/api/auth/oauth/google/callback')
    // Google adds parameters of its own
    .query({ code: account, state, scope: 'openid email profile', authuser: '0' })
    .expect(302);
  const target = new URL(callback.headers['location'] ?? '');
  return target.pathname + target.search;
}

describe('OAuth sign-in (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  async function identitiesOf(userId: string) {
    return t.db.select().from(authIdentities).where(eq(authIdentities.userId, userId));
  }

  it('creates a confirmed account without a password and returns to the app', async () => {
    const agent = t.agent();

    expect(
      await google(agent, 'anya', { next: '/g/1/tasks', locale: 'en', timezone: 'Asia/Tokyo' }),
    ).toBe('/g/1/tasks');

    const { body: me } = await agent.get('/api/auth/me').expect(200);
    expect(me).toMatchObject({
      name: 'anya Google',
      email: 'anya@gmail.com',
      emailVerified: true,
      locale: 'en',
      timezone: 'Asia/Tokyo',
      avatarUrl: 'https://lh3.googleusercontent.test/anya',
    });
    expect(await identitiesOf(me.id)).toMatchObject([
      { provider: 'google', providerUserId: 'sub-anya', email: 'anya@gmail.com' },
    ]);
    expect(
      await t.db.select().from(passwordCredentials).where(eq(passwordCredentials.userId, me.id)),
    ).toEqual([]);
    await t
      .agent()
      .post('/api/auth/login')
      .send({ email: 'anya@gmail.com', password: PASSWORD })
      .expect(401);
  });

  it('signs the same Google account into the same user on another device', async () => {
    const first = t.agent();
    await google(first, 'anya');
    const second = t.agent();
    await google(second, 'anya');

    const [a, b] = await Promise.all([first.get('/api/auth/me'), second.get('/api/auth/me')]);
    expect(b.body.id).toBe(a.body.id);
    expect(await t.db.select().from(users)).toHaveLength(1);
  });

  it('links a confirmed password account, which keeps its password', async () => {
    const user = await createUser(t.db, { email: 'anya@gmail.com' });
    const agent = t.agent();

    await google(agent, 'anya');

    expect((await agent.get('/api/auth/me').expect(200)).body.id).toBe(user.id);
    await signIn(t, 'anya@gmail.com');
  });

  it("locks a squatter out of an unconfirmed account with the owner's email", async () => {
    const user = await createUser(t.db, { email: 'anya@gmail.com', verified: false });
    const squatter = await signIn(t, 'anya@gmail.com');

    await google(t.agent(), 'anya');

    await squatter.get('/api/auth/me').expect(401);
    await t
      .agent()
      .post('/api/auth/login')
      .send({ email: 'anya@gmail.com', password: PASSWORD })
      .expect(401);
    expect(await identitiesOf(user.id)).toHaveLength(1);
  });

  it('fails back to the login page without the starting browser, on cancel and for an unverified email', async () => {
    const victim = t.agent();
    expect(await google(t.agent(), 'anya', {}, victim)).toBe(FAILED);
    await victim.get('/api/auth/me').expect(401);

    const agent = t.agent();
    const start = await agent.get('/api/auth/oauth/google').expect(302);
    const state = new URL(start.headers['location'] ?? '').searchParams.get('state') ?? '';
    const cancelled = await agent
      .get('/api/auth/oauth/google/callback')
      .query({ error: 'access_denied', state })
      .expect(302);
    expect(cancelled.headers['location']).toMatch(new RegExp(`${FAILED.replace('?', '\\?')}$`));

    t.identity.unverified.add('bohdan');
    expect(await google(t.agent(), 'bohdan')).toBe(FAILED);
    expect(await t.db.select().from(users)).toEqual([]);
  });

  it('returns only into the app and knows only its providers', async () => {
    expect(await google(t.agent(), 'anya', { next: '//evil.com/steal' })).toBe('/');
    await t.agent().get('/api/auth/oauth/github').expect(404);
    await t.agent().get('/api/auth/oauth/google').query({ locale: 'de' }).expect(400);
  });

  it('forgets the Google account when the user deletes theirs', async () => {
    const agent = t.agent();
    await google(agent, 'anya');
    const { body: me } = await agent.get('/api/auth/me').expect(200);

    await agent.delete('/api/me').expect(204);

    expect(await identitiesOf(me.id)).toEqual([]);
    await google(t.agent(), 'anya');
    expect((await t.db.select().from(users))[0]?.id).not.toBe(me.id);
  });
});
