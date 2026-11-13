import { createUser, PASSWORD, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('Profile and account (integration)', () => {
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

  it('updates only the fields that were sent', async () => {
    const user = await createUser(t.db, { name: 'Anya' });
    const agent = await signIn(t, user.email);

    const { body } = await agent
      .patch('/api/me')
      .send({ name: '  Anya K.  ', locale: 'en' })
      .expect(200);

    expect(body).toMatchObject({ name: 'Anya K.', locale: 'en', timezone: 'Europe/Kyiv' });
    await agent.patch('/api/me').send({ timezone: 'America/New_York' }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ name: 'Anya K.', locale: 'en', timezone: 'America/New_York' });
  });

  it('answers the current profile to an empty update', async () => {
    const user = await createUser(t.db, { name: 'Oleh' });
    const agent = await signIn(t, user.email);

    await agent
      .patch('/api/me')
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body.name).toBe('Oleh');
      });
  });

  it('validates the profile', async () => {
    const agent = await signIn(t, (await createUser(t.db)).email);

    await agent
      .patch('/api/me')
      .send({ name: ' ', timezone: 'Mars/Olympus' })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { name: 'required', timezone: 'invalid' } });
  });

  it('deletes the account and ends its sessions', async () => {
    const user = await createUser(t.db);
    const agent = await signIn(t, user.email);
    const other = await signIn(t, user.email);

    await agent.delete('/api/me').expect(204);

    await other.get('/api/auth/me').expect(401);
    await t
      .agent()
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);
  });
});
