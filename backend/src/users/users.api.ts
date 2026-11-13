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
  /** IANA zone of the device; the column default otherwise */
  timezone?: string;
}

/** Returns DTOs, never rows; `db` joins the caller's transaction */
@Injectable()
export class UsersApi {
  constructor(private readonly users: UsersRepository) {}

  async findById(id: string, db?: DbExecutor): Promise<UserDto | null> {
    const row = await this.users.findById(id, db);
    return row ? toUserDto(row) : null;
  }

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

  /** An already confirmed email keeps its original time */
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
