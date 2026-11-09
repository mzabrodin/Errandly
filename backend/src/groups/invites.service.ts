import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Clock } from '../common/clock.js';
import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { generateToken, hashToken } from '../common/tokens.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { appLink } from '../config/urls.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersApi } from '../users/index.js';
import type { AcceptInviteDto, InviteDto, InviteInfoDto } from './dto/group.dto.js';
import { GroupsApi } from './groups.api.js';
import { GroupsRepository } from './groups.repository.js';
import { INVITE_TTL_MS, isInviteActive, pickMemberColor } from './groups.rules.js';
import type { InviteRow } from './groups.schema.js';

/** Invite links (FR-11–14, SD-2): 7 days, any number of uses, only the SHA-256 is stored */
@Injectable()
export class InvitesService {
  private readonly appUrl: string;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: GroupsRepository,
    private readonly access: GroupsApi,
    private readonly users: UsersApi,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /** An admin creates a link; with `email` the recipient also gets their own link by email */
  async create(groupId: string, actorId: string, email?: string): Promise<InviteDto> {
    const token = generateToken();
    const expiresAt = new Date(this.clock.now().getTime() + INVITE_TTL_MS);
    await this.db.transaction(async (tx) => {
      await this.access.requireAdmin(groupId, actorId, tx);
      await this.repository.insertInvite(
        { groupId, invitedBy: actorId, email: null, tokenHash: hashToken(token), expiresAt },
        tx,
      );
      if (email !== undefined) {
        await this.bus.publish(tx, 'group.inviteEmailRequested', {
          groupId,
          email,
          invitedBy: actorId,
          expiresAt: expiresAt.toISOString(),
        });
      }
    });
    return { url: appLink(this.appUrl, '/invite', token), expiresAt: expiresAt.toISOString() };
  }

  /** What the invite page shows; works signed out. FR-13: a dead link answers 410 */
  async info(token: string, viewerId: string | null): Promise<InviteInfoDto> {
    const invite = await this.activeInvite(token);
    const [group, inviter, membership] = await Promise.all([
      this.repository.findGroup(invite.groupId),
      invite.invitedBy === null ? null : this.users.findById(invite.invitedBy),
      viewerId === null ? undefined : this.repository.findMembership(invite.groupId, viewerId),
    ]);
    if (!group) throw new DomainError('INVITE_INVALID');
    return {
      groupId: group.id,
      groupName: group.name,
      invitedBy: inviter?.name ?? '',
      alreadyMember: membership !== undefined,
    };
  }

  /** FR-12: joins as a member; accepting again is a no-op. Needs a confirmed email */
  async accept(token: string, userId: string): Promise<AcceptInviteDto> {
    const invite = await this.activeInvite(token);
    const user = await this.users.findById(userId);
    if (user?.emailVerified !== true) throw new DomainError('EMAIL_NOT_VERIFIED');
    const { groupId } = invite;
    await this.db.transaction(async (tx) => {
      const members = await this.repository.membersOf(groupId, tx, { lock: true });
      if (members.some((member) => member.userId === userId)) return;
      const color = pickMemberColor(members.map((member) => member.color));
      await this.repository.insertMembership({ groupId, userId, role: 'member', color }, tx);
      await this.bus.publish(tx, 'group.memberJoined', { groupId, userId });
    });
    return { groupId };
  }

  private async activeInvite(token: string): Promise<InviteRow> {
    const invite = await this.repository.findInviteByHash(hashToken(token));
    if (!invite || !isInviteActive(invite, this.clock.now())) {
      throw new DomainError('INVITE_INVALID');
    }
    return invite;
  }
}
