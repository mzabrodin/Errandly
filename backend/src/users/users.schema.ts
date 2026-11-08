import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { DEFAULT_LOCALE, LIMITS, LOCALES } from '../common/domain.js';
import { createdAt, id, timestamptz, updatedAt } from '../db/columns.js';

export const localeEnum = pgEnum('locale', LOCALES);

/**
 * The person: profile only. How they sign in lives in the auth module
 * (password_credentials, auth_identities), so a new sign-in method never changes this table.
 */
export const users = pgTable(
  'users',
  {
    id: id(),
    name: varchar({ length: LIMITS.userName }).notNull(),
    /** Stored lowercased, so uniqueness is case-insensitive */
    email: varchar({ length: LIMITS.email }).notNull(),
    emailVerifiedAt: timestamptz(),
    /** IANA time zone used to show times and send reminders */
    timezone: text().notNull().default('Europe/Kyiv'),
    locale: localeEnum().notNull().default(DEFAULT_LOCALE),
    avatarUrl: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
