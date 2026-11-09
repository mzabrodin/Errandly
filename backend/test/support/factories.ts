import type TestAgent from 'supertest/lib/agent.js';

import { passwordCredentials } from '../../src/auth/auth.schema.js';
import type { Locale } from '../../src/common/domain.js';
import type { Database } from '../../src/db/database.js';
import { users, type UserRow } from '../../src/users/users.schema.js';
import { TEST_HASHER, type TestApp } from './test-app.js';

export const PASSWORD = 'Pass1234';

let sequence = 0;

export interface UserOverrides {
  name?: string;
  email?: string;
  locale?: Locale;
  verified?: boolean;
  /** null: an account without a password (Google sign-in only) */
  password?: string | null;
}

/** A user straight in the database: verified, with the password PASSWORD, unless told otherwise */
export async function createUser(db: Database, overrides: UserOverrides = {}): Promise<UserRow> {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? `User ${sequence}`,
      email: overrides.email ?? `user${sequence}@errandly.test`,
      locale: overrides.locale ?? 'uk',
      emailVerifiedAt: overrides.verified === false ? null : new Date('2026-01-01T00:00:00Z'),
    })
    .returning();
  if (!user) throw new Error('user was not inserted');

  const password = overrides.password === undefined ? PASSWORD : overrides.password;
  if (password !== null) {
    await db
      .insert(passwordCredentials)
      .values({ userId: user.id, passwordHash: await TEST_HASHER.hash(password) });
  }
  return user;
}

/** A signed-in client for the user */
export async function signIn(
  testApp: TestApp,
  email: string,
  password: string = PASSWORD,
): Promise<TestAgent> {
  const agent = testApp.agent();
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}
