import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { isUniqueViolation } from '../common/errors/api-exception.filter.js';
import { DomainError } from '../common/errors/domain-error.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { users, type NewUserRow, type UserRow } from './users.schema.js';

export type UserChanges = Partial<
  Pick<
    NewUserRow,
    'name' | 'timezone' | 'locale' | 'emailVerifiedAt' | 'providerAvatarUrl' | 'uploadedAvatarKey'
  >
>;

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string, db: DbExecutor = this.db): Promise<UserRow | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async lockById(id: string, tx: DbExecutor): Promise<UserRow | undefined> {
    const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for('update');
    return row;
  }

  async findByIds(ids: readonly string[], db: DbExecutor = this.db): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]));
  }

  /** `email` must already be lowercased (NormalizeEmail) */
  async findByEmail(email: string, db: DbExecutor = this.db): Promise<UserRow | undefined> {
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  /** EMAIL_TAKEN also when a concurrent sign-up won the race */
  async insert(values: NewUserRow, db: DbExecutor = this.db): Promise<UserRow> {
    try {
      const [row] = await db.insert(users).values(values).returning();
      if (!row) throw new Error('INSERT … RETURNING returned no row');
      return row;
    } catch (error: unknown) {
      if (isUniqueViolation(error, 'users_email_key')) throw new DomainError('EMAIL_TAKEN');
      throw error;
    }
  }

  async update(
    id: string,
    changes: UserChanges,
    db: DbExecutor = this.db,
  ): Promise<UserRow | undefined> {
    const [row] = await db.update(users).set(changes).where(eq(users.id, id)).returning();
    return row;
  }

  async delete(id: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
}
