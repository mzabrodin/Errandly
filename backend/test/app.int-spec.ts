import { createTestApp, type TestApp } from './support/test-app.js';

describe('App (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  it('/api/health (GET) checks every component without a session', () => {
    return t
      .agent()
      .get('/api/health')
      .expect(200)
      .expect({
        status: 'up',
        components: { database: 'up', storage: 'up', mail: 'up', events: 'up' },
      });
  });

  it('stays ready, but degraded, while storage and mail are down', async () => {
    t.clock.advance(30 * 1000);
    t.storage.failNext();
    t.mailbox.failNext();

    await t
      .agent()
      .get('/api/health')
      .expect(200)
      .expect({
        status: 'degraded',
        components: { database: 'up', storage: 'down', mail: 'down', events: 'up' },
      });
    t.mailbox.clear();
  });

  it('/api/health/live answers without asking any dependency', () => {
    return t.agent().get('/api/health/live').expect(200).expect({ status: 'up' });
  });

  it('echoes the request id', () => {
    return t
      .agent()
      .get('/api/health')
      .set('X-Request-Id', 'int-123')
      .expect('x-request-id', 'int-123');
  });

  it('does not serve Swagger UI outside development', () => {
    return t.agent().get('/api/docs').expect(404);
  });

  it('sends security headers (helmet)', async () => {
    const response = await t.agent().get('/api/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
