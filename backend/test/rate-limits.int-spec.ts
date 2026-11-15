import type { SessionService } from '../src/auth/sessions.service.js';
import type { TestApp } from './support/test-app.js';

// NFR-SEC-07: limits per account, or per IP without a session. The other integration files raise them,
// so this one lowers them before the app module is imported (ConfigModule reads the environment when
// AppModule loads). Every request here comes from the same IP.

const TOO_MANY = { code: 'TOO_MANY_REQUESTS', retryAfterSeconds: expect.any(Number) };
describe('Rate limits (integration)', () => {
  let t: TestApp;
  let sessions: SessionService;
  let createUser: typeof import('./support/factories.js').createUser;

  beforeAll(async () => {
    process.env['RATE_LIMIT_PER_MINUTE'] = '8';
    process.env['AUTH_RATE_LIMIT_PER_MINUTE'] = '3';
    const { createTestApp } = await import('./support/test-app.js');
    ({ createUser } = await import('./support/factories.js'));
    t = await createTestApp();
    sessions = t.app.get((await import('../src/auth/sessions.service.js')).SessionService);
    await t.reset();
  });

  const limits = {
    general: process.env['RATE_LIMIT_PER_MINUTE'],
    strict: process.env['AUTH_RATE_LIMIT_PER_MINUTE'],
  };

  afterAll(async () => {
    await t.close();
    process.env['RATE_LIMIT_PER_MINUTE'] = limits.general;
    process.env['AUTH_RATE_LIMIT_PER_MINUTE'] = limits.strict;
  });

  const login = () =>
    t.agent().post('/api/auth/login').send({ email: 'a@errandly.test', password: 'Pass1234' });

  const groups = (cookie: string) => t.agent().get('/api/groups').set('Cookie', cookie);

  /** A session made directly: signing in has its own small budget */
  async function sessionCookie(): Promise<string> {
    const { token } = await sessions.create((await createUser(t.db)).id);
    return `errandly_session=${token}`;
  }

  it('cuts sign-in attempts off earlier than other requests, per IP', async () => {
    for (let i = 0; i < 3; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      await login().expect(401);
    }
    const { body } = await login().expect(429).expect('Retry-After', /^\d+$/);
    expect(body).toEqual(TOO_MANY);
  });

  it('gives flatmates behind one IP a budget each', async () => {
    const anya = await sessionCookie();
    const oleh = await sessionCookie();

    for (let i = 0; i < 8; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      await groups(anya).expect(200);
    }
    await groups(anya).expect(429).expect('Retry-After', /^\d+$/);
    await groups(oleh).expect(200);
  });

  it('cuts password changes off like sign-in (NFR-SEC-07)', async () => {
    const cookie = await sessionCookie();
    const change = () =>
      t
        .agent()
        .post('/api/me/password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'Wrong1234', newPassword: 'Newpass123' });

    for (let i = 0; i < 3; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      await change().expect(400);
    }
    await change().expect(429);
  });

  it('limits anonymous requests to protected routes too, and leaves the health check alone', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      statuses.push((await t.agent().get('/api/groups')).status);
    }

    expect(statuses).toContain(429);
    await t.agent().get('/api/health').expect(200);
  });
});
