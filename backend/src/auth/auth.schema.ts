import {
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { AUTH_PROVIDERS, EMAIL_TOKEN_PURPOSES, LIMITS } from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';
import { users } from '../users/users.schema.js';

export const authProviderEnum = pgEnum('auth_provider', AUTH_PROVIDERS);
export const emailTokenPurposeEnum = pgEnum('email_token_purpose', EMAIL_TOKEN_PURPOSES);

/** Email and password sign-in; absent for accounts that only use an external provider */
export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Argon2id PHC string `$argon2id$v=19$m=…,t=…,p=…$salt$hash` (Argon2PasswordHasher) */
  passwordHash: text().notNull(),
  /** Lockout after 5 failed logins in a row (ACCOUNT_LOCKED) */
  failedLogins: smallint().notNull().default(0),
  lockedUntil: timestamptz(),
  updatedAt: updatedAt(),
});

/** A linked external account (Google today; Apple or Microsoft = a new enum value) */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum().notNull(),
    /** The provider's stable account id (`sub` claim for Google) */
    providerUserId: text().notNull(),
    /** Email the provider reported; informational, the profile email lives in users */
    email: varchar({ length: LIMITS.email }),
    createdAt: createdAt(),
    lastUsedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_account_key').on(t.provider, t.providerUserId),
    uniqueIndex('auth_identities_user_provider_key').on(t.userId, t.provider),
  ],
);

/** Cookie sessions; the cookie holds a random token and only its SHA-256 is stored (SYS-24) */
export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token, hex */
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz().notNull(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

/** One-time tokens from email links: verification and password reset */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurposeEnum().notNull(),
    /** SHA-256 of the token from the link, hex */
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('email_tokens_token_hash_key').on(t.tokenHash),
    index('email_tokens_user_id_idx').on(t.userId),
  ],
);

export type PasswordCredentialsRow = typeof passwordCredentials.$inferSelect;
export type AuthIdentityRow = typeof authIdentities.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type EmailTokenRow = typeof emailTokens.$inferSelect;
