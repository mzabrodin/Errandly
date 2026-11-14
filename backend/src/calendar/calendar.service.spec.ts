import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import { TokenCipher } from '../common/crypto/token-cipher.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database, DbExecutor } from '../db/database.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { CalendarApi } from './calendar-api.js';
import type { CalendarRepository, NewConnection } from './calendar.repository.js';
import type { CalendarConnectionRow } from './calendar.schema.js';
import { CalendarService } from './calendar.service.js';
import { CalendarAccessRevoked, type CalendarGateway } from './gateways/calendar-gateway.js';
import type { CalendarGateways } from './gateways/calendar-gateways.js';
import type { CalendarOAuth } from './oauth/calendar-oauth.js';
import { sealState } from './oauth/oauth-state.js';

const NOW = new Date('2026-11-14T10:00:00Z');

class FakeRepository {
  connections: CalendarConnectionRow[] = [];
  reminders = new Map<string, number>();

  findByUser(userId: string) {
    return Promise.resolve(this.connections.find((row) => row.userId === userId));
  }

  save(values: NewConnection, now: Date) {
    const existing = this.connections.find((row) => row.userId === values.userId);
    const fresh = { ...values, syncStatus: 'ok' as const, failedAttempts: 0, lastError: null };
    if (existing) Object.assign(existing, fresh, { updatedAt: now });
    else {
      this.connections.push({
        id: `c-${values.userId}`,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
        ...fresh,
      });
    }
    return Promise.resolve();
  }

  delete(id: string) {
    this.connections = this.connections.filter((row) => row.id !== id);
    return Promise.resolve();
  }

  resume(id: string) {
    const row = this.connections.find((item) => item.id === id);
    if (row) Object.assign(row, { syncStatus: 'ok', failedAttempts: 0, lastError: null });
    return Promise.resolve();
  }

  reminderMinutesOf(userId: string) {
    return Promise.resolve(this.reminders.get(userId) ?? 60);
  }

  saveReminderMinutes(userId: string, minutes: number) {
    this.reminders.set(userId, minutes);
    return Promise.resolve();
  }
}

type Listener = (event: never, tx?: DbExecutor) => Promise<void>;

function setup({ configured = true } = {}) {
  const repository = new FakeRepository();
  const published: [string, unknown][] = [];
  const listeners = new Map<string, Listener>();
  const calendars = new Set<string>();
  const deleted: string[] = [];
  const revoked: string[] = [];
  const config = {
    get: () => Buffer.alloc(32, 5).toString('base64'),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const cipher = new TokenCipher(config);
  const gateway = {
    createCalendar: (refreshToken: string) => {
      const id = `${refreshToken}-calendar`;
      calendars.add(id);
      return Promise.resolve(id);
    },
    calendarExists: ({ calendarId }: { calendarId: string }) =>
      Promise.resolve(calendars.has(calendarId)),
    deleteCalendar: ({ calendarId }: { calendarId: string }) => {
      deleted.push(calendarId);
      return calendarId === 'revoked-calendar'
        ? Promise.reject(new CalendarAccessRevoked())
        : Promise.resolve();
    },
  } as unknown as CalendarGateway;
  const oauth = {
    configured,
    authUrl: (state: string) => `https://accounts.google.test/?state=${state}`,
    exchange: (code: string) =>
      code === 'broken'
        ? Promise.reject(new Error('invalid_grant'))
        : Promise.resolve({ refreshToken: `rt-${code}`, email: `${code}@gmail.com` }),
    revoke: (token: string) => {
      revoked.push(token);
      return Promise.resolve();
    },
  } as unknown as CalendarOAuth;
  const bus = {
    publish: (_tx: unknown, type: string, event: unknown) => {
      published.push([type, event]);
      return Promise.resolve();
    },
    onInTransaction: (type: string, listener: Listener) => listeners.set(type, listener),
    onAfterCommit: (_type: string, id: string, listener: Listener) => listeners.set(id, listener),
  } as unknown as EventBus;
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx'),
  } as unknown as Database;
  const users = {
    findById: (id: string) => Promise.resolve({ id, timezone: 'Europe/Kyiv' } as UserDto),
  } as unknown as UsersApi;
  const repo = repository as unknown as CalendarRepository;
  const clock = new FixedClock(NOW);
  const service = new CalendarService(
    db,
    repo,
    oauth,
    { for: () => gateway } as unknown as CalendarGateways,
    users,
    cipher,
    bus,
    clock,
  );
  service.onModuleInit();
  const api = new CalendarApi(db, repo, bus, clock);
  const state = (userId: string) => sealState(cipher, userId, NOW);
  return { repository, published, listeners, calendars, deleted, revoked, service, api, state };
}

describe('CalendarService', () => {
  it('answers 503 while no Google OAuth client is configured', () => {
    const { service } = setup({ configured: false });

    expect(() => service.connectUrl('anya')).toThrow(new DomainError('SERVICE_UNAVAILABLE'));
  });

  it('connects: creates the calendar, stores the grant encrypted and asks for a resync', async () => {
    const { service, repository, published, state } = setup();

    expect(service.connectUrl('anya')).toMatch(/^https:\/\/accounts\.google\.test\/\?state=v1\./);
    expect(await service.complete('anya', { code: 'anya', state: state('anya') })).toBe(true);

    expect(repository.connections[0]).toMatchObject({
      calendarId: 'rt-anya-calendar',
      accountEmail: 'anya@gmail.com',
    });
    expect(repository.connections[0]?.refreshTokenEncrypted).not.toContain('rt-anya');
    expect(published).toEqual([['calendar.resyncRequested', { userId: 'anya' }]]);
  });

  it('refuses a missing code, a declined consent, a foreign state and a failed exchange', async () => {
    const { service, repository, state } = setup();

    expect(await service.complete('anya', { state: state('anya') })).toBe(false);
    expect(await service.complete('anya', { error: 'access_denied' })).toBe(false);
    expect(await service.complete('anya', { code: 'anya', state: state('bohdan') })).toBe(false);
    expect(await service.complete('anya', { code: 'broken', state: state('anya') })).toBe(false);
    expect(repository.connections).toEqual([]);
  });

  it('keeps its calendar on reconnect, but replaces it for another Google account', async () => {
    const { service, repository, published, state } = setup();
    await service.complete('anya', { code: 'anya', state: state('anya') });
    await service.complete('anya', { code: 'anya', state: state('anya') });
    expect(repository.connections[0]?.calendarId).toBe('rt-anya-calendar');
    published.length = 0;

    await service.complete('anya', { code: 'work', state: state('anya') });

    expect(repository.connections[0]?.calendarId).toBe('rt-work-calendar');
    expect(published.map(([type]) => type)).toEqual([
      'calendar.connectionClosed',
      'calendar.resyncRequested',
    ]);
  });

  it('disconnects at once and removes the calendar after commit (SYS-18)', async () => {
    const { service, repository, published, listeners, deleted, revoked, state } = setup();
    await service.complete('anya', { code: 'anya', state: state('anya') });
    published.length = 0;

    expect(await service.disconnect('anya')).toMatchObject({ connected: false });
    expect(repository.connections).toEqual([]);
    const [[type, event] = []] = published;
    expect(type).toBe('calendar.connectionClosed');
    await listeners.get('calendar.removeCalendar')?.(event as never);

    expect(deleted).toEqual(['rt-anya-calendar']);
    expect(revoked).toEqual(['rt-anya']);
  });

  it('still revokes the grant when the calendar is out of reach', async () => {
    const { listeners, revoked } = setup();
    const cipher = new TokenCipher({
      get: () => Buffer.alloc(32, 5).toString('base64'),
    } as unknown as ConfigService<EnvironmentVariables, true>);

    await listeners.get('calendar.removeCalendar')?.({
      provider: 'google',
      calendarId: 'revoked-calendar',
      refreshTokenEncrypted: cipher.encrypt('rt-gone'),
    } as never);

    expect(revoked).toEqual(['rt-gone']);
  });

  it('closes the connection of a deleted account in its transaction', async () => {
    const { service, repository, published, listeners, state } = setup();
    await service.complete('anya', { code: 'anya', state: state('anya') });
    published.length = 0;

    await listeners.get('user.deleted')?.({ userId: 'anya' } as never, 'tx' as never);
    await listeners.get('user.deleted')?.({ userId: 'nobody' } as never, 'tx' as never);

    expect(repository.connections).toEqual([]);
    expect(published.map(([type]) => type)).toEqual(['calendar.connectionClosed']);
  });

  it('resumes a paused sync on "sync now", and refuses without a calendar', async () => {
    const { service, repository, published, state } = setup();
    await expect(service.syncNow('anya')).rejects.toEqual(
      new DomainError('CALENDAR_NOT_CONNECTED'),
    );
    await service.complete('anya', { code: 'anya', state: state('anya') });
    Object.assign(repository.connections[0] ?? {}, { syncStatus: 'paused', failedAttempts: 5 });
    published.length = 0;

    expect(await service.syncNow('anya')).toMatchObject({ connected: true, syncStatus: 'ok' });
    expect(published).toEqual([['calendar.resyncRequested', { userId: 'anya' }]]);
  });
});

describe('CalendarApi', () => {
  it('keeps a reminder chosen before connecting, without a resync', async () => {
    const { api, published } = setup();
    expect((await api.settings('anya')).reminderMinutes).toBe(60);

    await api.setReminderMinutes('anya', 15);

    expect(await api.settings('anya')).toEqual({
      status: { connected: false, syncStatus: 'ok', googleEmail: null, lastSyncedAt: null },
      reminderMinutes: 15,
    });
    expect(published).toEqual([]);
  });

  it('resyncs only when the reminder time really changes', async () => {
    const { api, service, published, state } = setup();
    await service.complete('anya', { code: 'anya', state: state('anya') });
    published.length = 0;

    await api.setReminderMinutes('anya', 60);
    await api.setReminderMinutes('anya', 15);

    expect((await api.settings('anya')).reminderMinutes).toBe(15);
    expect(published).toEqual([['calendar.resyncRequested', { userId: 'anya' }]]);
  });
});
