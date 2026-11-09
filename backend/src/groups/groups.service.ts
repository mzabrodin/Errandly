import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import type { GroupRole } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { UsersApi } from '../users/index.js';
import type { GroupDto, GroupSummaryDto } from './dto/group.dto.js';
import { GroupsApi } from './groups.api.js';
import { toGroupDto } from './groups.mapper.js';
import { GroupsRepository } from './groups.repository.js';
import { assertCanChangeRole, isLastAdminWithOthers, pickMemberColor } from './groups.rules.js';

/** Groups, members and roles (FR-10, FR-15–18, SD-2) */
@Injectable()
export class GroupsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: GroupsRepository,
    private readonly access: GroupsApi,
    private readonly users: UsersApi,
    private readonly bus: EventBus,
  ) {}

  onModuleInit(): void {
    // In the deleting transaction: a veto rolls the deletion back (NFR-LEG-02)
    this.bus.onInTransaction('user.deleted', ({ userId }, tx) => this.leaveAllGroups(userId, tx));
  }

  list(userId: string): Promise<GroupSummaryDto[]> {
    return this.repository.groupsOfUser(userId);
  }

  /** FR-10: the creator becomes the first admin; only a confirmed email may create groups */
  async create(userId: string, name: string): Promise<GroupDto> {
    const user = await this.users.findById(userId);
    if (user?.emailVerified !== true) throw new DomainError('EMAIL_NOT_VERIFIED');
    return this.db.transaction(async (tx) => {
      const group = await this.repository.insertGroup(name, userId, tx);
      await this.repository.insertMembership(
        { groupId: group.id, userId, role: 'admin', color: pickMemberColor([]) },
        tx,
      );
      await this.bus.publish(tx, 'group.created', { groupId: group.id, userId });
      return this.load(group.id, 'admin', tx);
    });
  }

  async get(groupId: string, userId: string): Promise<GroupDto> {
    const role = await this.access.requireMember(groupId, userId);
    return this.load(groupId, role);
  }

  /** FR-15: an admin removes someone else; their open tasks are redistributed (tasks module) */
  async removeMember(groupId: string, actorId: string, userId: string): Promise<void> {
    if (actorId === userId) {
      await this.access.requireAdmin(groupId, actorId);
      throw new DomainError('CANNOT_REMOVE_SELF');
    }
    await this.db.transaction(async (tx) => {
      await this.access.requireAdmin(groupId, actorId, tx);
      const members = await this.repository.membersOf(groupId, tx, { lock: true });
      if (!members.some((member) => member.userId === userId)) {
        throw new DomainError('NOT_FOUND');
      }
      await this.repository.deleteMembership(groupId, userId, tx);
      await this.bus.publish(tx, 'group.memberLeft', { groupId, userId, removedBy: actorId });
    });
  }

  /** FR-16: admins give or take the admin role; the group always keeps one admin */
  async changeRole(
    groupId: string,
    actorId: string,
    userId: string,
    role: GroupRole,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.access.requireAdmin(groupId, actorId, tx);
      const members = await this.repository.membersOf(groupId, tx, { lock: true });
      const target = members.find((member) => member.userId === userId);
      if (!target) throw new DomainError('NOT_FOUND');
      assertCanChangeRole(members, target, role);
      if (target.role === role) return;
      await this.repository.updateRole(groupId, userId, role, tx);
      await this.bus.publish(tx, 'group.roleChanged', { groupId, userId, role, actorId });
    });
  }

  /** FR-16: anyone may leave, except the only admin of a group that still has others */
  async leave(groupId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.access.requireMember(groupId, userId, tx);
      await this.leaveGroup(groupId, userId, tx);
    });
  }

  private async leaveGroup(groupId: string, userId: string, tx: DbExecutor): Promise<void> {
    const members = await this.repository.membersOf(groupId, tx, { lock: true });
    if (isLastAdminWithOthers(members, userId)) throw new DomainError('LAST_ADMIN');
    await this.repository.deleteMembership(groupId, userId, tx);
    await this.bus.publish(tx, 'group.memberLeft', { groupId, userId, removedBy: null });
    // Nobody left to see it: the group, its invites and tasks go
    if (members.length === 1) await this.repository.deleteGroup(groupId, tx);
  }

  /**
   * Account deletion leaves every group, so open tasks are redistributed first. The only
   * admin of a group with other members blocks it: 409 LAST_ADMIN with the group names.
   */
  private async leaveAllGroups(userId: string, tx: DbExecutor): Promise<void> {
    const memberships = await this.repository.membershipsOfUser(userId, tx);
    const blocking: string[] = [];
    for (const membership of memberships) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so queries run in order anyway
      const members = await this.repository.membersOf(membership.groupId, tx, { lock: true });
      if (isLastAdminWithOthers(members, userId)) blocking.push(membership.groupName);
    }
    if (blocking.length > 0) throw new DomainError('LAST_ADMIN', { groups: blocking });
    for (const membership of memberships) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so queries run in order anyway
      await this.leaveGroup(membership.groupId, userId, tx);
    }
  }

  private async load(groupId: string, role: GroupRole, db?: DbExecutor): Promise<GroupDto> {
    const [group, members, absences] = await Promise.all([
      this.repository.findGroup(groupId, db),
      this.repository.membersOf(groupId, db),
      this.repository.absencesOf(groupId, db),
    ]);
    if (!group) throw new DomainError('FORBIDDEN');
    const users = await this.users.findMany(
      members.map((member) => member.userId),
      db,
    );
    return toGroupDto({ group, role, members, absences, users });
  }
}
