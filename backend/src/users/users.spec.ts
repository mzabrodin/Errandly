import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database } from '../db/database.js';
import { MeController } from './me.controller.js';
import { UsersApi } from './users.api.js';
import type { UserChanges, UsersRepository } from './users.repository.js';
import type { UserRow } from './users.schema.js';
import { UsersService } from './users.service.js';

function row(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    name: 'Anya',
    email: 'anya@errandly.test',
    emailVerifiedAt: null,
    timezone: 'Europe/Kyiv',
    locale: 'uk',
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeRepository {
  rows = new Map<string, UserRow>();
  updates: UserChanges[] = [];
  deleted: string[] = [];

  findById(id: string) {
    return Promise.resolve(this.rows.get(id));
  }

  findByIds(ids: readonly string[]) {
    return Promise.resolve([...this.rows.values()].filter((r) => ids.includes(r.id)));
  }

  findByEmail(email: string) {
    return Promise.resolve([...this.rows.values()].find((r) => r.email === email));
  }

  insert(values: { name: string; email: string; locale: 'uk' | 'en' }) {
    const inserted = row({ id: `u${this.rows.size + 1}`, ...values });
    this.rows.set(inserted.id, inserted);
    return Promise.resolve(inserted);
  }

  update(id: string, changes: UserChanges) {
    this.updates.push(changes);
    const current = this.rows.get(id);
    if (!current) return Promise.resolve(undefined);
    const next = { ...current, ...changes } as UserRow;
    this.rows.set(id, next);
    return Promise.resolve(next);
  }

  delete(id: string) {
    this.deleted.push(id);
    this.rows.delete(id);
    return Promise.resolve();
  }
}

describe('UsersApi', () => {
  const repository = new FakeRepository();
  const api = new UsersApi(repository as unknown as UsersRepository);

  beforeEach(() => {
    repository.rows.clear();
  });

  it('returns DTOs with emailVerified derived from the timestamp', async () => {
    repository.rows.set('u1', row());

    await expect(api.findById('u1')).resolves.toEqual({
      id: 'u1',
      name: 'Anya',
      email: 'anya@errandly.test',
      emailVerified: false,
      timezone: 'Europe/Kyiv',
      locale: 'uk',
      avatarUrl: null,
    });
    await expect(api.findByEmail('anya@errandly.test')).resolves.toMatchObject({ id: 'u1' });
    await expect(api.findById('nobody')).resolves.toBeNull();
    await expect(api.findByEmail('nobody@errandly.test')).resolves.toBeNull();
  });

  it('finds many users at once, keyed by id', async () => {
    repository.rows.set('u1', row());
    repository.rows.set('u2', row({ id: 'u2', name: 'Oleh' }));

    const found = await api.findMany(['u1', 'u2', 'gone']);

    expect([...found.keys()]).toEqual(['u1', 'u2']);
    expect(found.get('u2')?.name).toBe('Oleh');
  });

  it('creates a user', async () => {
    await expect(
      api.create({ name: 'Oleh', email: 'oleh@errandly.test', locale: 'en' }),
    ).resolves.toMatchObject({ name: 'Oleh', locale: 'en', emailVerified: false });
  });

  it('marks the email verified once and keeps the first time', async () => {
    const first = new Date('2026-11-01T00:00:00Z');
    repository.rows.set('u1', row());
    repository.rows.set('u2', row({ id: 'u2', emailVerifiedAt: first }));

    await expect(api.markEmailVerified('u1', new Date())).resolves.toMatchObject({
      emailVerified: true,
    });
    await api.markEmailVerified('u2', new Date());
    expect(repository.rows.get('u2')?.emailVerifiedAt).toBe(first);
    await expect(api.markEmailVerified('nobody', new Date())).resolves.toBeNull();
  });
});

function setup() {
  const repository = new FakeRepository();
  const published: [string, unknown][] = [];
  const bus = {
    publish: (_tx: unknown, type: string, event: unknown) => {
      published.push([type, event]);
      return Promise.resolve();
    },
  };
  const db = { transaction: (work: (tx: unknown) => Promise<void>) => work('tx') };
  const service = new UsersService(
    db as unknown as Database,
    repository as unknown as UsersRepository,
    bus as unknown as EventBus,
  );
  return { repository, published, service };
}

describe('UsersService', () => {
  it('changes only the fields that were sent', async () => {
    const { repository, service } = setup();
    repository.rows.set('u1', row());

    await expect(service.updateProfile('u1', { locale: 'en' })).resolves.toMatchObject({
      name: 'Anya',
      locale: 'en',
    });
    await service.updateProfile('u1', { name: 'Anya K.', timezone: 'Europe/Warsaw' });

    expect(repository.updates).toEqual([
      { locale: 'en' },
      { name: 'Anya K.', timezone: 'Europe/Warsaw' },
    ]);
  });

  it('answers the profile to an empty update without writing', async () => {
    const { repository, service } = setup();
    repository.rows.set('u1', row());

    await expect(service.updateProfile('u1', {})).resolves.toMatchObject({ id: 'u1' });
    expect(repository.updates).toEqual([]);
  });

  it('answers UNAUTHENTICATED when the user is gone', async () => {
    await expect(setup().service.updateProfile('gone', {})).rejects.toEqual(
      new DomainError('UNAUTHENTICATED'),
    );
  });

  it('publishes user.deleted before deleting, in one transaction', async () => {
    const { repository, published, service } = setup();
    repository.rows.set('u1', row());

    await service.deleteAccount('u1');

    expect(published).toEqual([['user.deleted', { userId: 'u1' }]]);
    expect(repository.deleted).toEqual(['u1']);
  });
});

describe('MeController', () => {
  it('updates the profile and deletes the account, clearing the cookie', async () => {
    const calls: unknown[][] = [];
    const dto = { id: 'u1', name: 'Anya' };
    const users = {
      updateProfile: (...args: unknown[]) => {
        calls.push(['updateProfile', ...args]);
        return Promise.resolve(dto);
      },
      deleteAccount: (...args: unknown[]) => {
        calls.push(['deleteAccount', ...args]);
        return Promise.resolve();
      },
    } as unknown as UsersService;
    const config = { get: () => 'development' } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >;
    const cleared: string[] = [];
    const response = { clearCookie: (name: string) => cleared.push(name) } as unknown as Response;
    const controller = new MeController(users, config);
    const user = { id: 'u1', sessionId: 's1' };

    await expect(controller.updateProfile(user, { name: 'Anya' })).resolves.toBe(dto);
    await controller.deleteAccount(user, response);

    expect(calls).toEqual([
      ['updateProfile', 'u1', { name: 'Anya' }],
      ['deleteAccount', 'u1'],
    ]);
    expect(cleared).toEqual(['errandly_session']);
  });
});
