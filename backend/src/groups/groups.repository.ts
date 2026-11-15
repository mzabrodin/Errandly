import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';

import type { GroupRole } from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { insertedRow } from '../db/inserted-row.js';
import type { PurgeCutoffs } from './groups.rules.js';
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

function membershipKey(groupId: string, userId: string): SQL | undefined {
  return and(eq(memberships.groupId, groupId), eq(memberships.userId, userId));
}

@Injectable()
export class GroupsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insertGroup(name: string, createdBy: string, db: DbExecutor = this.db): Promise<GroupRow> {
    return insertedRow(await db.insert(groups).values({ name, createdBy }).returning());
  }

  async findGroup(id: string, db: DbExecutor = this.db): Promise<GroupRow | undefined> {
    const [row] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    return row;
  }

  async findGroups(ids: readonly string[], db: DbExecutor = this.db): Promise<GroupRow[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(groups)
      .where(inArray(groups.id, [...ids]));
  }

  /** Members, invites, absences and tasks go with it (ON DELETE CASCADE) */
  async deleteGroup(id: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(groups).where(eq(groups.id, id));
  }

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

  async findMembership(
    groupId: string,
    userId: string,
    db: DbExecutor = this.db,
  ): Promise<MembershipRow | undefined> {
    const [row] = await db
      .select()
      .from(memberships)
      .where(membershipKey(groupId, userId))
      .limit(1);
    return row;
  }

  /** `lock`: two concurrent role changes must not both see "another admin is left" (LAST_ADMIN) */
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
    await db.update(memberships).set({ role }).where(membershipKey(groupId, userId));
  }

  /** The member's absences go with it (absences_membership_fk cascades) */
  async deleteMembership(groupId: string, userId: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(memberships).where(membershipKey(groupId, userId));
  }

  async insertInvite(invite: NewInvite, db: DbExecutor = this.db): Promise<InviteRow> {
    return insertedRow(await db.insert(invites).values(invite).returning());
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

  absencesOf(groupId: string, db: DbExecutor = this.db): Promise<AbsenceRow[]> {
    return db
      .select()
      .from(absences)
      .where(eq(absences.groupId, groupId))
      .orderBy(asc(absences.startsOn), asc(absences.id));
  }

  async purge(cutoffs: PurgeCutoffs, db: DbExecutor = this.db): Promise<Record<string, number>> {
    const { invitesBefore, absencesEndedBefore } = cutoffs;
    const deadInvites = await db
      .delete(invites)
      .where(or(lt(invites.expiresAt, invitesBefore), lt(invites.revokedAt, invitesBefore)));
    const pastAbsences = await db.delete(absences).where(lt(absences.endsOn, absencesEndedBefore));
    return { invites: deadInvites.rowCount ?? 0, absences: pastAbsences.rowCount ?? 0 };
  }

  async insertAbsence(
    absence: Pick<AbsenceRow, 'groupId' | 'userId' | 'startsOn' | 'endsOn'>,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db.insert(absences).values(absence);
  }

  async deleteAbsence(id: string, groupId: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(absences)
      .where(and(eq(absences.id, id), eq(absences.groupId, groupId), eq(absences.userId, userId)))
      .returning({ id: absences.id });
    return deleted.length > 0;
  }
}
