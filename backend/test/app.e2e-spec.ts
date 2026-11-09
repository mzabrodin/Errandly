import { createTestApp, type TestApp } from './support/test-app.js';

describe('App (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('/api/health (GET) works without a session', () => {
    return t.agent().get('/api/health').expect(200).expect({ status: 'ok', database: 'up' });
  });

  it('echoes the request id', () => {
    return t
      .agent()
      .get('/api/health')
      .set('X-Request-Id', 'e2e-123')
      .expect('x-request-id', 'e2e-123');
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
