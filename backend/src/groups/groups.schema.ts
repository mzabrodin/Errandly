import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { GROUP_ROLES, LIMITS } from '../common/domain.js';
import { createdAt, id, timestamptz } from '../db/columns.js';
import { users } from '../users/users.schema.js';

export const groupRoleEnum = pgEnum('group_role', GROUP_ROLES);

/** Aggregate root: members, invites and task series do not exist without their group */
export const groups = pgTable('groups', {
  id: id(),
  name: varchar({ length: LIMITS.groupName }).notNull(),
  createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** User-to-group link with a role. A group always keeps at least one admin (LAST_ADMIN, enforced in the service) */
export const memberships = pgTable(
  'memberships',
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: groupRoleEnum().notNull().default('member'),
    /** Hex colour of the member in the calendar */
    color: varchar({ length: 7 }).notNull(),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

/** Invite links; the link holds a random token and only its SHA-256 is stored */
export const invites = pgTable(
  'invites',
  {
    id: id(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Address the invite was emailed to; null for a copied link */
    email: varchar({ length: LIMITS.email }),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    revokedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invites_token_hash_key').on(t.tokenHash),
    index('invites_group_id_idx').on(t.groupId),
  ],
);

/** A member's absence: no tasks are assigned to them on these days (FR-15, FR-29) */
export const absences = pgTable(
  'absences',
  {
    id: id(),
    groupId: uuid().notNull(),
    userId: uuid().notNull(),
    /** Inclusive local dates, yyyy-mm-dd */
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Leaving the group removes the member's absences too
    foreignKey({
      name: 'absences_membership_fk',
      columns: [t.groupId, t.userId],
      foreignColumns: [memberships.groupId, memberships.userId],
    }).onDelete('cascade'),
    index('absences_group_user_idx').on(t.groupId, t.userId),
    check('absences_range', sql`${t.startsOn} <= ${t.endsOn}`),
  ],
);

export type GroupRow = typeof groups.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type AbsenceRow = typeof absences.$inferSelect;
