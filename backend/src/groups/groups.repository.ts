import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';

import type { GroupRole } from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import {
  absences,
  groups,
  invites,
  memberships,
  type AbsenceRow,
  type GroupRow,
  type InviteRow,
  type MembershipRow,
} from './groups.schema.js';

export interface GroupSummaryRow {
  id: string;
  name: string;
  role: GroupRole;
  memberCount: number;
}

export interface UserMembershipRow extends MembershipRow {
  groupName: string;
}

export interface NewInvite {
  groupId: string;
  invitedBy: string;
  email: string | null;
  tokenHash: string;
  expiresAt: Date;
}

/** The only place that queries groups, memberships, invites and absences */
@Injectable()
export class GroupsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Groups

  async insertGroup(name: string, createdBy: string, db: DbExecutor = this.db): Promise<GroupRow> {
    const [row] = await db.insert(groups).values({ name, createdBy }).returning();
    if (!row) throw new Error('INSERT … RETURNING returned no row');
    return row;
  }

  async findGroup(id: string, db: DbExecutor = this.db): Promise<GroupRow | undefined> {
    const [row] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    return row;
  }

  /** Members, invites, absences and tasks go with it (ON DELETE CASCADE) */
  async deleteGroup(id: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(groups).where(eq(groups.id, id));
  }

  /** The user's groups with their role and the member count, oldest membership first */
  groupsOfUser(userId: string): Promise<GroupSummaryRow[]> {
    const counts = this.db
      .select({ groupId: memberships.groupId, memberCount: count().as('member_count') })
      .from(memberships)
      .groupBy(memberships.groupId)
      .as('counts');
    return this.db
      .select({
        id: groups.id,
        name: groups.name,
        role: memberships.role,
        memberCount: counts.memberCount,
      })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .innerJoin(counts, eq(counts.groupId, memberships.groupId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.joinedAt), asc(groups.id));
  }

  // Memberships

  async findMembership(
    groupId: string,
    userId: string,
    db: DbExecutor = this.db,
  ): Promise<MembershipRow | undefined> {
    const [row] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)))
      .limit(1);
    return row;
  }

  /**
   * Members in join order. `lock` takes row locks until the transaction ends, so two
   * concurrent role changes cannot both see "another admin is left" (LAST_ADMIN).
   */
  membersOf(
    groupId: string,
    db: DbExecutor = this.db,
    { lock = false } = {},
  ): Promise<MembershipRow[]> {
    const query = db
      .select()
      .from(memberships)
      .where(eq(memberships.groupId, groupId))
      .orderBy(asc(memberships.joinedAt), asc(memberships.userId));
    return lock ? query.for('update') : query;
  }

  /** Every membership of the user, with the group name, locked for an account deletion */
  membershipsOfUser(userId: string, db: DbExecutor = this.db): Promise<UserMembershipRow[]> {
    return db
      .select({
        groupId: memberships.groupId,
        userId: memberships.userId,
        role: memberships.role,
        color: memberships.color,
        joinedAt: memberships.joinedAt,
        groupName: groups.name,
      })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.joinedAt))
      .for('update', { of: memberships });
  }

  async insertMembership(
    membership: Pick<MembershipRow, 'groupId' | 'userId' | 'role' | 'color'>,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db.insert(memberships).values(membership);
  }

  async updateRole(
    groupId: string,
    userId: string,
    role: GroupRole,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  }

  /** The member's absences go with it (absences_membership_fk cascades) */
  async deleteMembership(groupId: string, userId: string, db: DbExecutor = this.db): Promise<void> {
    await db
      .delete(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  }

  // Invites

  async insertInvite(invite: NewInvite, db: DbExecutor = this.db): Promise<InviteRow> {
    const [row] = await db.insert(invites).values(invite).returning();
    if (!row) throw new Error('INSERT … RETURNING returned no row');
    return row;
  }

  async findInviteByHash(tokenHash: string): Promise<InviteRow | undefined> {
    const [row] = await this.db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  /** Earlier emailed links to this address stop working, so only the newest one does */
  async revokeEmailInvites(
    groupId: string,
    email: string,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .update(invites)
      .set({ revokedAt: now })
      .where(
        and(eq(invites.groupId, groupId), eq(invites.email, email), isNull(invites.revokedAt)),
      );
  }

  // Absences

  absencesOf(groupId: string, db: DbExecutor = this.db): Promise<AbsenceRow[]> {
    return db
      .select()
      .from(absences)
      .where(eq(absences.groupId, groupId))
      .orderBy(asc(absences.startsOn), asc(absences.id));
  }

  async insertAbsence(
    absence: Pick<AbsenceRow, 'groupId' | 'userId' | 'startsOn' | 'endsOn'>,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db.insert(absences).values(absence);
  }

  /** Deletes the user's own absence; false when there is none with that id in the group */
  async deleteAbsence(id: string, groupId: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(absences)
      .where(and(eq(absences.id, id), eq(absences.groupId, groupId), eq(absences.userId, userId)))
      .returning({ id: absences.id });
    return deleted.length > 0;
  }
}
