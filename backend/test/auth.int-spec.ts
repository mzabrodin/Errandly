import { eq } from 'drizzle-orm';

import { passwordCredentials } from '../src/auth/auth.schema.js';
import { users } from '../src/users/users.schema.js';
import { createUser, PASSWORD, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const MINUTE = 60 * 1000;

function sessionCookie(headers: Record<string, unknown>): string | undefined {
  const cookies: unknown = headers['set-cookie'];
  if (!Array.isArray(cookies)) return undefined;
  return cookies.find((cookie: string) => cookie.startsWith('errandly_session='));
}

describe('Auth (integration)', () => {
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

  describe('registration (FR-01–04)', () => {
    const anya = { name: 'Anya Kovalenko', email: 'Anya@Errandly.test', password: PASSWORD };

    it('creates the account, signs it in and emails a verification link', async () => {
      const agent = t.agent();
      const response = await agent
        .post('/api/auth/register')
        .send({ ...anya, locale: 'en', timezone: 'Europe/Warsaw' })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Anya Kovalenko',
        email: 'anya@errandly.test',
        emailVerified: false,
        locale: 'en',
        timezone: 'Europe/Warsaw',
        timezoneAuto: true,
        avatarUrl: null,
      });
      const cookie = sessionCookie(response.headers);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\/api/);
      await agent.get('/api/auth/me').expect(200);

      expect(await t.deliverEvents()).toBe(1);
      const [mail] = t.mailbox.to('anya@errandly.test');
      expect(mail?.subject).toBe('Verify your email for Errandly');
      const token = t.mailbox.lastToken('anya@errandly.test', '/verify-email');

      const verified = await t.agent().post('/api/auth/verify-email').send({ token }).expect(200);
      expect(verified.body).toMatchObject({ email: 'anya@errandly.test', emailVerified: true });

      await t
        .agent()
        .post('/api/auth/verify-email')
        .send({ token })
        .expect(400)
        .expect({ code: 'TOKEN_INVALID' });
    });

    it('refuses an email that is taken, ignoring case', async () => {
      await createUser(t.db, { email: 'anya@errandly.test' });

      await t
        .agent()
        .post('/api/auth/register')
        .send(anya)
        .expect(409)
        .expect({ code: 'EMAIL_TAKEN' });
    });

    it('stores the password only as an argon2id hash (NFR-SEC-01)', async () => {
      const { body } = await t.agent().post('/api/auth/register').send(anya).expect(201);

      const [row] = await t.db
        .select()
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, body.id));
      expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row?.passwordHash).not.toContain(PASSWORD);
    });

    it('keeps the account when SMTP is down and delivers the email on a retry', async () => {
      t.mailbox.failNext();
      await t.agent().post('/api/auth/register').send(anya).expect(201);

      await t.deliverEvents();
      expect(t.mailbox.sent).toHaveLength(0);
      expect(await t.db.select().from(users)).toHaveLength(1);

      t.clock.advance(30 * 1000);
      await t.deliverEvents();
      expect(t.mailbox.to('anya@errandly.test')).toHaveLength(1);
    });

    it('sends the verification email again, but not once the email is confirmed', async () => {
      const unverified = await createUser(t.db, { verified: false });
      const agent = await signIn(t, unverified.email);
      await agent.post('/api/auth/verify-email/resend').expect(204);
      await t.deliverEvents();
      expect(t.mailbox.to(unverified.email)).toHaveLength(1);

      const verified = await createUser(t.db);
      await (await signIn(t, verified.email)).post('/api/auth/verify-email/resend').expect(204);
      await t.deliverEvents();
      expect(t.mailbox.to(verified.email)).toHaveLength(0);
    });

    it('only accepts the newest verification link', async () => {
      const user = await createUser(t.db, { verified: false });
      const agent = await signIn(t, user.email);
      await agent.post('/api/auth/verify-email/resend').expect(204);
      await t.deliverEvents();
      const first = t.mailbox.lastToken(user.email, '/verify-email');
      await agent.post('/api/auth/verify-email/resend').expect(204);
      await t.deliverEvents();

      await t
        .agent()
        .post('/api/auth/verify-email')
        .send({ token: first })
        .expect(400)
        .expect({ code: 'TOKEN_INVALID' });
    });
  });

  describe('sign-in (FR-05–06)', () => {
    it('signs in and out', async () => {
      const user = await createUser(t.db, { email: 'oleh@errandly.test' });
      const agent = t.agent();
      const login = await agent
        .post('/api/auth/login')
        .send({ email: 'OLEH@errandly.test', password: PASSWORD })
        .expect(200);
      expect(login.body).toMatchObject({ id: user.id, emailVerified: true });

      const logout = await agent.post('/api/auth/logout').expect(204);
      expect(sessionCookie(logout.headers)).toMatch(/errandly_session=;/);
      await agent.get('/api/auth/me').expect(401).expect({ code: 'UNAUTHENTICATED' });
    });

    it('answers the same for an unknown email and a wrong password', async () => {
      await createUser(t.db, { email: 'oleh@errandly.test' });

      await t
        .agent()
        .post('/api/auth/login')
        .send({ email: 'nobody@errandly.test', password: PASSWORD })
        .expect(401)
        .expect({ code: 'INVALID_CREDENTIALS' });
      await t
        .agent()
        .post('/api/auth/login')
        .send({ email: 'oleh@errandly.test', password: 'Wrong1234' })
        .expect(401)
        .expect({ code: 'INVALID_CREDENTIALS' });
    });

    it('locks the account for 15 minutes after the 5th wrong password', async () => {
      const user = await createUser(t.db);
      const attempt = (password: string) =>
        t.agent().post('/api/auth/login').send({ email: user.email, password });

      for (let i = 0; i < 4; i += 1) {
        // oxlint-disable-next-line no-await-in-loop -- the attempts must happen in order
        await attempt('Wrong1234').expect(401);
      }
      await attempt('Wrong1234').expect(423).expect({
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: 900,
      });

      t.clock.advance(5 * MINUTE);
      await attempt(PASSWORD).expect(423).expect({
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: 600,
      });

      t.clock.advance(10 * MINUTE);
      await attempt(PASSWORD).expect(200);
    });
  });

  describe('sessions (SYS-06–07)', () => {
    it('deny every route without a valid session (default-deny)', async () => {
      await t.agent().get('/api/groups').expect(401).expect({ code: 'UNAUTHENTICATED' });
      await t.agent().get('/api/groups').set('Cookie', 'errandly_session=forged').expect(401);
    });

    it('expire 30 days after the last use and slide while in use', async () => {
      const user = await createUser(t.db);
      const agent = await signIn(t, user.email);

      t.clock.advance(20 * 24 * 60 * MINUTE);
      const refreshed = await agent.get('/api/auth/me').expect(200);
      expect(sessionCookie(refreshed.headers)).toBeDefined();

      t.clock.advance(20 * 24 * 60 * MINUTE);
      await agent.get('/api/auth/me').expect(200);

      t.clock.advance(31 * 24 * 60 * MINUTE);
      await agent.get('/api/auth/me').expect(401);
    });
  });

  describe('password reset (FR-08, NFR-SEC-08)', () => {
    it('answers 204 for an unknown email without sending anything', async () => {
      await t
        .agent()
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@errandly.test' })
        .expect(204);
      await t.deliverEvents();

      expect(t.mailbox.sent).toHaveLength(0);
    });

    it('sets a new password once, unlocks and signs out every session', async () => {
      const user = await createUser(t.db, { name: 'Marta Shevchenko', locale: 'en' });
      const oldSession = await signIn(t, user.email);
      await t.agent().post('/api/auth/forgot-password').send({ email: user.email }).expect(204);
      await t.deliverEvents();
      const [mail] = t.mailbox.to(user.email);
      expect(mail?.text).toContain('/reset-password/');
      const token = t.mailbox.lastToken(user.email, '/reset-password');

      await t
        .agent()
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPass123' })
        .expect(204);

      await oldSession.get('/api/auth/me').expect(401);
      await signIn(t, user.email, 'NewPass123');
      await t
        .agent()
        .post('/api/auth/reset-password')
        .send({ token, password: 'Another123' })
        .expect(400)
        .expect({ code: 'TOKEN_INVALID' });
    });

    it('refuses a link created 61 minutes ago and keeps the password', async () => {
      const user = await createUser(t.db);
      await t.agent().post('/api/auth/forgot-password').send({ email: user.email }).expect(204);
      await t.deliverEvents();
      const token = t.mailbox.lastToken(user.email, '/reset-password');

      t.clock.advance(61 * MINUTE);
      await t
        .agent()
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPass123' })
        .expect(400)
        .expect({ code: 'TOKEN_INVALID' });

      await signIn(t, user.email, PASSWORD);
    });
  });

  describe('change password', () => {
    it('keeps this session and signs out the others', async () => {
      const user = await createUser(t.db);
      const laptop = await signIn(t, user.email);
      const phone = await signIn(t, user.email);

      await laptop
        .post('/api/me/password')
        .send({ currentPassword: PASSWORD, newPassword: 'NewPass123' })
        .expect(204);

      await laptop.get('/api/auth/me').expect(200);
      await phone.get('/api/auth/me').expect(401);
      await signIn(t, user.email, 'NewPass123');
    });
  });

  describe('request hardening (NFR-SEC-06)', () => {
    it('refuses state-changing requests from another origin', async () => {
      await t
        .agent()
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: 'a@b.c', password: PASSWORD })
        .expect(403)
        .expect({ code: 'FORBIDDEN' });
    });

    it('accepts requests from the app origin', async () => {
      const user = await createUser(t.db);

      await t
        .agent()
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
    });
  });
});
