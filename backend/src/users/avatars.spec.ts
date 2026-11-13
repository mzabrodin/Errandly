import { Readable } from 'node:stream';
import sharp from 'sharp';

import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import { ObjectStorage, type StoredObject } from '../common/storage/object-storage.js';
import type { Database } from '../db/database.js';
import { AvatarFilesController } from './avatar-files.controller.js';
import { AVATAR_SIZE, toAvatarImage } from './avatar-image.js';
import { AvatarsService } from './avatars.service.js';
import type { UserChanges, UsersRepository } from './users.repository.js';
import { avatarUrlOf, isAvatarKey, newAvatarKey } from './users.rules.js';
import type { UserRow } from './users.schema.js';

const KEY = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.webp';
const GOOGLE = 'https://lh3.googleusercontent.com/a/photo';

function png(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#e6f36b' } })
    .png()
    .toBuffer();
}

function row(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    name: 'Anya',
    email: 'anya@errandly.test',
    emailVerifiedAt: null,
    timezone: 'Europe/Kyiv',
    locale: 'uk',
    providerAvatarUrl: null,
    uploadedAvatarKey: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class MemoryStorage extends ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(null);
    return Promise.resolve({
      body: Readable.from(object.body),
      contentType: object.contentType,
      size: object.body.length,
    });
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

class FakeUsers {
  rows = new Map<string, UserRow>();
  failUpdate = false;

  lockById(id: string) {
    return Promise.resolve(this.rows.get(id));
  }

  update(id: string, changes: UserChanges) {
    if (this.failUpdate) return Promise.reject(new Error('database is down'));
    const current = this.rows.get(id);
    if (!current) return Promise.resolve(undefined);
    const next = Object.assign(row(), current, changes);
    this.rows.set(id, next);
    return Promise.resolve(next);
  }
}

type DiscardListener = (event: { key: string }) => Promise<void>;

function setup() {
  const storage = new MemoryStorage();
  const users = new FakeUsers();
  const published: [string, unknown][] = [];
  const listeners = new Map<string, DiscardListener>();
  const bus = {
    publish: (_tx: unknown, type: string, event: unknown) => {
      published.push([type, event]);
      return Promise.resolve();
    },
    onAfterCommit: (_type: string, id: string, listener: DiscardListener) => {
      listeners.set(id, listener);
    },
  };
  const db = { transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx') };
  const service = new AvatarsService(
    db as unknown as Database,
    users as unknown as UsersRepository,
    storage,
    bus as unknown as EventBus,
  );
  service.onModuleInit();
  return { storage, users, published, listeners, service };
}

describe('avatar rules', () => {
  it('makes a fresh UUID key per upload and accepts only such keys', () => {
    const key = newAvatarKey();

    expect(isAvatarKey(key)).toBe(true);
    expect(newAvatarKey()).not.toBe(key);
    expect(isAvatarKey('../users.webp')).toBe(false);
    expect(isAvatarKey(KEY.replace('.webp', '.png'))).toBe(false);
    expect(isAvatarKey(KEY.toUpperCase())).toBe(false);
  });

  it('prefers the uploaded photo, then the provider photo, then none', () => {
    expect(avatarUrlOf({ uploadedAvatarKey: KEY, providerAvatarUrl: GOOGLE })).toBe(
      `/api/avatars/${KEY}`,
    );
    expect(avatarUrlOf({ uploadedAvatarKey: null, providerAvatarUrl: GOOGLE })).toBe(GOOGLE);
    expect(avatarUrlOf({ uploadedAvatarKey: null, providerAvatarUrl: null })).toBeNull();
  });
});

describe('toAvatarImage', () => {
  it('re-encodes any accepted image as a square WebP without metadata', async () => {
    const photo = await sharp(await png(640, 480))
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Anya', ImageDescription: 'Room 12' } })
      .toBuffer();

    const avatar = await toAvatarImage(photo);
    const metadata = await sharp(avatar).metadata();

    expect(metadata).toMatchObject({ format: 'webp', width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects files that are not JPEG, PNG, WebP or GIF', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    const typeError = new DomainError('VALIDATION', { fields: { file: 'type' } });

    await expect(toAvatarImage(Buffer.from('not an image'))).rejects.toEqual(typeError);
    await expect(toAvatarImage(svg)).rejects.toEqual(typeError);
    await expect(
      toAvatarImage(
        await sharp(await png())
          .tiff()
          .toBuffer(),
      ),
    ).rejects.toEqual(typeError);
  });

  it('refuses a canvas that would decompress to too many pixels', async () => {
    const bomb = await png(10_000, 5000);

    await expect(toAvatarImage(bomb)).rejects.toEqual(new DomainError('FILE_TOO_LARGE'));
  });
});

describe('AvatarsService', () => {
  it('stores the photo and points the user at it', async () => {
    const { storage, users, published, service } = setup();
    users.rows.set('u1', row({ providerAvatarUrl: GOOGLE }));

    const user = await service.upload('u1', await png());

    const [key] = [...storage.objects.keys()];
    expect(user.avatarUrl).toBe(`/api/avatars/${key}`);
    expect(storage.objects.get(key ?? '')?.contentType).toBe('image/webp');
    expect(published).toEqual([]);
  });

  it('discards the replaced photo after commit', async () => {
    const { storage, users, published, listeners, service } = setup();
    users.rows.set('u1', row({ uploadedAvatarKey: KEY }));
    await storage.put(KEY, Buffer.from('old'), 'image/webp');

    await service.upload('u1', await png());

    expect(published).toEqual([['user.avatarDiscarded', { key: KEY }]]);
    expect(storage.objects.has(KEY)).toBe(true);
    await listeners.get('users.deleteAvatarFile')?.({ key: KEY });
    expect(storage.objects.has(KEY)).toBe(false);
  });

  it('deletes the new file when the database change fails', async () => {
    const { storage, users, service } = setup();
    users.rows.set('u1', row());
    users.failUpdate = true;

    await expect(service.upload('u1', await png())).rejects.toThrow('database is down');
    expect(storage.objects.size).toBe(0);
  });

  it('keeps the original error when the cleanup fails too', async () => {
    const { storage, users, service } = setup();
    users.rows.set('u1', row());
    users.failUpdate = true;
    storage.delete = () => Promise.reject(new Error('storage is down'));

    await expect(service.upload('u1', await png())).rejects.toThrow('database is down');
  });

  it('requires a file and checks it before storing anything', async () => {
    const { storage, users, service } = setup();
    users.rows.set('u1', row());

    await expect(service.upload('u1', undefined)).rejects.toEqual(
      new DomainError('VALIDATION', { fields: { file: 'required' } }),
    );
    await expect(service.upload('u1', Buffer.alloc(0))).rejects.toBeInstanceOf(DomainError);
    await expect(service.upload('u1', Buffer.from('text'))).rejects.toBeInstanceOf(DomainError);
    expect(storage.objects.size).toBe(0);
  });

  it('falls back to the provider photo on delete, and deleting twice changes nothing', async () => {
    const { users, published, service } = setup();
    users.rows.set('u1', row({ uploadedAvatarKey: KEY, providerAvatarUrl: GOOGLE }));

    await expect(service.remove('u1')).resolves.toMatchObject({ avatarUrl: GOOGLE });
    await expect(service.remove('u1')).resolves.toMatchObject({ avatarUrl: GOOGLE });

    expect(published).toEqual([['user.avatarDiscarded', { key: KEY }]]);
  });

  it('answers UNAUTHENTICATED for a user that is gone', async () => {
    const { users, service } = setup();
    const unauthenticated = new DomainError('UNAUTHENTICATED');

    await expect(service.remove('gone')).rejects.toEqual(unauthenticated);
    users.rows.set('u1', row({ uploadedAvatarKey: KEY }));
    users.update = () => Promise.resolve(undefined);
    await expect(service.remove('u1')).rejects.toEqual(unauthenticated);
  });

  it('opens only well-formed keys', async () => {
    const { storage, service } = setup();
    await storage.put(KEY, Buffer.from('photo'), 'image/webp');

    await expect(service.open(KEY)).resolves.toMatchObject({ contentType: 'image/webp' });
    await expect(service.open(newAvatarKey())).resolves.toBeNull();
    await expect(service.open('../secret')).resolves.toBeNull();
  });
});

describe('avatar controllers', () => {
  it('streams a stored photo and answers 404 for anything else', async () => {
    const { storage, service } = setup();
    await storage.put(KEY, Buffer.from('photo'), 'image/webp');
    const controller = new AvatarFilesController(service);

    const file = await controller.file(KEY);

    expect(file.getHeaders()).toMatchObject({ type: 'image/webp', length: 5 });
    await expect(controller.file(newAvatarKey())).rejects.toEqual(new DomainError('NOT_FOUND'));
  });
});
