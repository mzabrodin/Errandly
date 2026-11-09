import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Clock } from '../common/clock.js';
import { EventBus } from '../common/events/event-bus.js';
import { generateToken, hashToken } from '../common/tokens.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { appLink } from '../config/urls.js';
import { DATABASE, type Database } from '../db/database.js';
import { MailService } from '../mail/index.js';
import { UsersApi } from '../users/index.js';
import { GroupsRepository } from './groups.repository.js';

/**
 * Emailed invites (FR-11), sent after commit with retries. Each delivery creates the
 * recipient's own link (expiring with the admin's link) and revokes earlier emailed links to
 * that address, so a retry never needs a raw token stored anywhere.
 */
@Injectable()
export class InviteEmails implements OnModuleInit {
  private readonly appUrl: string;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: GroupsRepository,
    private readonly users: UsersApi,
    private readonly mail: MailService,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  onModuleInit(): void {
    this.bus.onAfterCommit('group.inviteEmailRequested', 'groups.sendInviteEmail', (event) =>
      this.send(event.groupId, event.email, event.invitedBy, new Date(event.expiresAt)),
    );
  }

  async send(groupId: string, email: string, invitedBy: string, expiresAt: Date): Promise<void> {
    const now = this.clock.now();
    const [group, inviter, recipient] = await Promise.all([
      this.repository.findGroup(groupId),
      this.users.findById(invitedBy),
      this.users.findByEmail(email),
    ]);
    // The group or the inviter is gone, or the link would arrive dead: nothing to send
    if (!group || !inviter || expiresAt <= now) return;

    const token = generateToken();
    await this.db.transaction(async (tx) => {
      await this.repository.revokeEmailInvites(groupId, email, now, tx);
      await this.repository.insertInvite(
        { groupId, invitedBy, email, tokenHash: hashToken(token), expiresAt },
        tx,
      );
    });
    // The recipient's account language; without an account, the inviter's (docs/api.md)
    await this.mail.send(
      'invite',
      email,
      {
        inviterName: inviter.name,
        groupName: group.name,
        url: appLink(this.appUrl, '/invite', token),
      },
      recipient?.locale ?? inviter.locale,
    );
  }
}
