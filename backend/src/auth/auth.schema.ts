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

/** Absent for accounts that only sign in with Google */
export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text().notNull(),
  failedLogins: smallint().notNull().default(0),
  lockedUntil: timestamptz(),
  updatedAt: updatedAt(),
});

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum().notNull(),
    /** `sub` claim for Google */
    providerUserId: text().notNull(),
    /** Informational; the profile email lives in users */
    email: varchar({ length: LIMITS.email }),
    createdAt: createdAt(),
    lastUsedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_account_key').on(t.provider, t.providerUserId),
    uniqueIndex('auth_identities_user_provider_key').on(t.userId, t.provider),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token (SYS-24) */
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

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurposeEnum().notNull(),
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
