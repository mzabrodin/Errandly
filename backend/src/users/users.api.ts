import { Injectable } from '@nestjs/common';

import type { Locale } from '../common/domain.js';
import type { DbExecutor } from '../db/database.js';
import type { UserDto } from './dto/user.dto.js';
import { toUserDto } from './users.mapper.js';
import { UsersRepository } from './users.repository.js';

export interface NewUser {
  name: string;
  /** Lowercased */
  email: string;
  locale: Locale;
}

/**
 * Public API of the users module for other modules (auth, groups, notifications).
 * Returns DTOs, never rows; `db` lets a caller run it inside its own transaction.
 */
@Injectable()
export class UsersApi {
  constructor(private readonly users: UsersRepository) {}

  async findById(id: string, db?: DbExecutor): Promise<UserDto | null> {
    const row = await this.users.findById(id, db);
    return row ? toUserDto(row) : null;
  }

  /** Users by id, keyed by id; unknown ids are left out */
  async findMany(ids: readonly string[], db?: DbExecutor): Promise<Map<string, UserDto>> {
    const rows = await this.users.findByIds(ids, db);
    return new Map(rows.map((row) => [row.id, toUserDto(row)]));
  }

  async findByEmail(email: string, db?: DbExecutor): Promise<UserDto | null> {
    const row = await this.users.findByEmail(email, db);
    return row ? toUserDto(row) : null;
  }

  /** Throws EMAIL_TAKEN */
  async create(user: NewUser, db?: DbExecutor): Promise<UserDto> {
    return toUserDto(await this.users.insert(user, db));
  }

  /** Confirms the email; an already confirmed one keeps its original time */
  async markEmailVerified(id: string, at: Date, db?: DbExecutor): Promise<UserDto | null> {
    const row = await this.users.findById(id, db);
    if (!row) return null;
    if (row.emailVerifiedAt !== null) return toUserDto(row);
    const updated = await this.users.update(id, { emailVerifiedAt: at }, db);
    return updated ? toUserDto(updated) : null;
  }

  async setProviderAvatar(
    id: string,
    url: string | null,
    db?: DbExecutor,
  ): Promise<UserDto | null> {
    const row = await this.users.update(id, { providerAvatarUrl: url }, db);
    return row ? toUserDto(row) : null;
  }
}
