import { Inject, Injectable } from '@nestjs/common';

import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database } from '../db/database.js';
import type { UpdateProfileDto } from './dto/profile.dto.js';
import type { UserDto } from './dto/user.dto.js';
import { toUserDto } from './users.mapper.js';
import { UsersRepository, type UserChanges } from './users.repository.js';

/** The signed-in user's own profile and account (FR-38, NFR-COMP-03, NFR-LEG-02) */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersRepository,
    private readonly bus: EventBus,
  ) {}

  async updateProfile(userId: string, changes: UpdateProfileDto): Promise<UserDto> {
    const patch: UserChanges = {};
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.timezone !== undefined) patch.timezone = changes.timezone;
    if (changes.locale !== undefined) patch.locale = changes.locale;

    const row =
      Object.keys(patch).length > 0
        ? await this.users.update(userId, patch)
        : await this.users.findById(userId);
    if (!row) throw new DomainError('UNAUTHENTICATED');
    return toUserDto(row);
  }

  /**
   * Deletes the account; sessions, credentials and memberships cascade. Listeners of
   * `user.deleted` run in the same transaction and can veto it (groups: LAST_ADMIN).
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.bus.publish(tx, 'user.deleted', { userId });
      await this.users.delete(userId, tx);
    });
  }
}
