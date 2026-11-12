import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { ObjectStorage, type StoredObject } from '../common/storage/object-storage.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { toAvatarImage } from './avatar-image.js';
import type { UserDto } from './dto/user.dto.js';
import { toUserDto } from './users.mapper.js';
import { UsersRepository } from './users.repository.js';
import { AVATAR_CONTENT_TYPE, isAvatarKey, newAvatarKey } from './users.rules.js';
import type { UserRow } from './users.schema.js';

/** Old files are deleted after commit, so a rolled-back change never loses the photo in use */
@Injectable()
export class AvatarsService implements OnModuleInit {
  private readonly logger = new Logger(AvatarsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersRepository,
    private readonly storage: ObjectStorage,
    private readonly bus: EventBus,
  ) {}

  onModuleInit(): void {
    this.bus.onAfterCommit('user.avatarDiscarded', 'users.deleteAvatarFile', ({ key }) =>
      this.storage.delete(key),
    );
  }

  async upload(userId: string, file: Buffer | undefined): Promise<UserDto> {
    if (file === undefined || file.length === 0) {
      throw new DomainError('VALIDATION', { fields: { file: 'required' } });
    }
    const image = await toAvatarImage(file);
    const key = newAvatarKey();
    await this.storage.put(key, image, AVATAR_CONTENT_TYPE);
    try {
      return toUserDto(await this.db.transaction((tx) => this.setKey(tx, userId, key)));
    } catch (error: unknown) {
      await this.storage.delete(key).catch((cleanupError: unknown) => {
        this.logger.warn(`Could not delete the unused avatar ${key}: ${String(cleanupError)}`);
      });
      throw error;
    }
  }

  async remove(userId: string): Promise<UserDto> {
    return toUserDto(await this.db.transaction((tx) => this.setKey(tx, userId, null)));
  }

  async open(key: string): Promise<StoredObject | null> {
    if (!isAvatarKey(key)) return null;
    return this.storage.get(key);
  }

  private async setKey(tx: DbExecutor, userId: string, key: string | null): Promise<UserRow> {
    const current = await this.users.lockById(userId, tx);
    if (!current) throw new DomainError('UNAUTHENTICATED');
    if (current.uploadedAvatarKey === key) return current;
    const updated = await this.users.update(userId, { uploadedAvatarKey: key }, tx);
    if (!updated) throw new DomainError('UNAUTHENTICATED');
    if (current.uploadedAvatarKey !== null) {
      await this.bus.publish(tx, 'user.avatarDiscarded', { key: current.uploadedAvatarKey });
    }
    return updated;
  }
}
