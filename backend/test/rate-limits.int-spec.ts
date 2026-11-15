import type { SessionService } from '../src/auth/sessions.service.js';
import type { TestApp } from './support/test-app.js';

// NFR-SEC-07: per-IP limits. The other integration files raise them, so this one lowers them before the
// app module is imported (ConfigModule reads the environment when AppModule loads).
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

  afterAll(async () => {
    await t.close();
  });

  const login = () =>
    t.agent().post('/api/auth/login').send({ email: 'a@errandly.test', password: 'Pass1234' });

  it('cuts sign-in attempts off earlier than other requests, per IP', async () => {
    for (let i = 0; i < 3; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      await login().expect(401);
    }
    await login().expect(429).expect({ code: 'TOO_MANY_REQUESTS' });
  });

  it('cuts password changes off like sign-in (NFR-SEC-07)', async () => {
    const user = await createUser(t.db);
    // A session made directly: the sign-in budget belongs to the test above
    const { token } = await sessions.create(user.id);
    const change = () =>
      t
        .agent()
        .post('/api/me/password')
        .set('Cookie', `errandly_session=${token}`)
        .send({ currentPassword: 'Wrong1234', newPassword: 'Newpass123' });

    for (let i = 0; i < 3; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      await change().expect(400);
    }
    await change().expect(429);
  });

  it('limits every route and leaves the health check alone', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- counted one after another
      statuses.push((await t.agent().get('/api/groups')).status);
    }

    expect(statuses).toContain(429);
    await t.agent().get('/api/health').expect(200);
  });
});
