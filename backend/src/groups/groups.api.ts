import { Injectable } from '@nestjs/common';

import type { GroupRole } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { DbExecutor } from '../db/database.js';
import { GroupsRepository } from './groups.repository.js';

export interface DateRange {
  /** yyyy-mm-dd, inclusive */
  from: string;
  /** yyyy-mm-dd, inclusive */
  to: string;
}

export interface GroupMember {
  userId: string;
  role: GroupRole;
  absences: DateRange[];
}

/** Access checks for other modules (NFR-SEC-04, SYS-07); `db` joins the caller's transaction */
@Injectable()
export class GroupsApi {
  constructor(private readonly repository: GroupsRepository) {}

  /** An unknown group is FORBIDDEN too, so outsiders can't tell whether it exists */
  async requireMember(groupId: string, userId: string, db?: DbExecutor): Promise<GroupRole> {
    const membership = await this.repository.findMembership(groupId, userId, db);
    if (!membership) throw new DomainError('FORBIDDEN');
    return membership.role;
  }

  /** 403 FORBIDDEN for outsiders, 403 ADMIN_ONLY for members */
  async requireAdmin(groupId: string, userId: string, db?: DbExecutor): Promise<void> {
    if ((await this.requireMember(groupId, userId, db)) !== 'admin') {
      throw new DomainError('ADMIN_ONLY');
    }
  }

  async members(groupId: string, db?: DbExecutor): Promise<GroupMember[]> {
    const [members, absences] = await Promise.all([
      this.repository.membersOf(groupId, db),
      this.repository.absencesOf(groupId, db),
    ]);
    return members.map((member) => ({
      userId: member.userId,
      role: member.role,
      absences: absences
        .filter((absence) => absence.userId === member.userId)
        .map((absence) => ({ from: absence.startsOn, to: absence.endsOn })),
    }));
  }
}
