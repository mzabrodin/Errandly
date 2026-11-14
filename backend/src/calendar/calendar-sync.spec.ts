import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import type { TokenCipher } from '../common/crypto/token-cipher.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database, DbExecutor } from '../db/database.js';
import type { TasksApi, TaskView } from '../tasks/index.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { CalendarSync } from './calendar-sync.js';
import type { CalendarRepository } from './calendar.repository.js';
import { eventIdFor, FAILURES_BEFORE_PAUSE } from './calendar.rules.js';
import type { CalendarConnectionRow, CalendarEventLinkRow } from './calendar.schema.js';
import {
  CalendarAccessRevoked,
  CalendarGateway,
  type CalendarAccess,
  type CalendarEvent,
} from './gateways/calendar-gateway.js';
import type { CalendarGateways } from './gateways/calendar-gateways.js';

const NOW = new Date('2026-11-14T10:00:00Z');
const TASK_ID = '019a6f3e-1c2d-7a00-8000-0000000000aa';
const EVENT_ID = eventIdFor(TASK_ID);

class FakeGoogle extends CalendarGateway {
  readonly events = new Map<string, Map<string, CalendarEvent>>();
  readonly calls: string[] = [];
  private failures: Error[] = [];

  failNext(error: Error, times = 1): void {
    this.failures = Array.from({ length: times }, () => error);
  }

  private outage(name: string): void {
    this.calls.push(name);
    const failure = this.failures.shift();
    if (failure) throw failure;
  }

  private calendar(access: CalendarAccess): Map<string, CalendarEvent> {
    const calendar = this.events.get(access.calendarId) ?? new Map<string, CalendarEvent>();
    this.events.set(access.calendarId, calendar);
    return calendar;
  }

  createCalendar(): Promise<string> {
    return Promise.reject(new Error('not used here'));
  }

  calendarExists(): Promise<boolean> {
    return Promise.resolve(true);
  }

  deleteCalendar(): Promise<void> {
    return Promise.resolve();
  }

  listEventIds(access: CalendarAccess): Promise<string[]> {
    this.outage('list');
    return Promise.resolve([...this.calendar(access).keys()]);
  }

  upsertEvent(access: CalendarAccess, eventId: string, event: CalendarEvent): Promise<void> {
    this.outage('upsert');
    this.calendar(access).set(eventId, event);
    return Promise.resolve();
  }

  deleteEvent(access: CalendarAccess, eventId: string): Promise<void> {
    this.outage('delete');
    this.calendar(access).delete(eventId);
    return Promise.resolve();
  }
}

class FakeRepository {
  connections: CalendarConnectionRow[] = [];
  links: CalendarEventLinkRow[] = [];

  connect(userId: string, overrides: Partial<CalendarConnectionRow> = {}): CalendarConnectionRow {
    const row = {
      id: `c-${userId}`,
      userId,
      provider: 'google',
      accountEmail: `${userId}@gmail.com`,
      refreshTokenEncrypted: `token-${userId}`,
      calendarId: `cal-${userId}`,
      syncStatus: 'ok',
      failedAttempts: 0,
      lastError: null,
      lastSyncedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } satisfies CalendarConnectionRow;
    this.connections.push(row);
    return row;
  }

  private row(id: string): CalendarConnectionRow {
    const row = this.connections.find((connection) => connection.id === id);
    if (!row) throw new Error(`no connection ${id}`);
    return row;
  }

  findByUser(userId: string) {
    return Promise.resolve(this.connections.find((row) => row.userId === userId));
  }

  reminderMinutesOf() {
    return Promise.resolve(60);
  }

  findById(id: string) {
    return Promise.resolve(this.connections.find((row) => row.id === id));
  }

  markSynced(id: string, now: Date) {
    Object.assign(this.row(id), { failedAttempts: 0, lastError: null, lastSyncedAt: now });
    return Promise.resolve();
  }

  recordFailure(id: string, error: string) {
    const row = this.row(id);
    row.failedAttempts += 1;
    row.lastError = error;
    if (row.failedAttempts >= FAILURES_BEFORE_PAUSE) row.syncStatus = 'paused';
    return Promise.resolve();
  }

  pause(id: string, error: string) {
    Object.assign(this.row(id), { syncStatus: 'paused', lastError: error });
    return Promise.resolve();
  }

  linksOfTask(taskId: string) {
    return Promise.resolve(this.links.filter((link) => link.taskId === taskId));
  }

  linksOfConnection(connectionId: string) {
    return Promise.resolve(this.links.filter((link) => link.connectionId === connectionId));
  }

  saveLink(link: Omit<CalendarEventLinkRow, 'syncedAt'>, now: Date) {
    this.links = this.links.filter(
      (row) => !(row.connectionId === link.connectionId && row.taskId === link.taskId),
    );
    this.links.push({ ...link, syncedAt: now });
    return Promise.resolve();
  }

  deleteLink(connectionId: string, taskId: string) {
    this.links = this.links.filter(
      (row) => !(row.connectionId === connectionId && row.taskId === taskId),
    );
    return Promise.resolve();
  }
}

type Listener = (event: never, tx?: DbExecutor) => Promise<void>;

function setup() {
  const repository = new FakeRepository();
  const google = new FakeGoogle();
  const tasks = new Map<string, TaskView>();
  const published: [string, unknown][] = [];
  const listeners = new Map<string, Listener>();
  const tasksApi = {
    hold: (id: string) => Promise.resolve(tasks.get(id) ?? null),
    assignedTo: (userId: string) =>
      Promise.resolve([...tasks.values()].filter((task) => task.assigneeId === userId)),
  } as unknown as TasksApi;
  const users = {
    findById: (id: string) => Promise.resolve({ id, timezone: 'Europe/Kyiv' } as UserDto),
  } as unknown as UsersApi;
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
  const cipher = { decrypt: (value: string) => value } as unknown as TokenCipher;
  const gateways = { for: () => google } as unknown as CalendarGateways;
  const config = { get: () => 'https://errandly.app' } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  const sync = new CalendarSync(
    db,
    repository as unknown as CalendarRepository,
    tasksApi,
    users,
    gateways,
    cipher,
    bus,
    new FixedClock(NOW),
    config,
  );
  sync.onModuleInit();

  function addTask(overrides: Partial<TaskView> = {}): TaskView {
    const task: TaskView = {
      id: TASK_ID,
      groupId: 'g1',
      title: 'Take out the trash',
      description: '',
      dueAt: new Date('2026-11-20T18:00:00Z'),
      assigneeId: 'anya',
      completedAt: null,
      ...overrides,
    };
    tasks.set(task.id, task);
    return task;
  }

  return { repository, google, tasks, published, listeners, sync, addTask };
}

describe('CalendarSync', () => {
  it("puts the task in its assignee's calendar and records the sync", async () => {
    const { repository, google, sync, addTask } = setup();
    repository.connect('anya');
    addTask();

    await sync.syncTask(TASK_ID);

    expect(google.events.get('cal-anya')?.get(EVENT_ID)?.title).toBe('Take out the trash');
    expect(repository.links).toEqual([
      { connectionId: 'c-anya', taskId: TASK_ID, externalEventId: EVENT_ID, syncedAt: NOW },
    ]);
    expect(repository.connections[0]?.lastSyncedAt).toEqual(NOW);
  });

  it('moves the event when the task is reassigned (FR-34)', async () => {
    const { repository, google, sync, addTask } = setup();
    repository.connect('anya');
    repository.connect('bohdan');
    addTask();
    await sync.syncTask(TASK_ID);

    addTask({ assigneeId: 'bohdan' });
    await sync.syncTask(TASK_ID);

    expect(google.events.get('cal-anya')?.size).toBe(0);
    expect(google.events.get('cal-bohdan')?.has(EVENT_ID)).toBe(true);
    expect(repository.links.map((link) => link.connectionId)).toEqual(['c-bohdan']);
  });

  it('makes no call for a task that is already gone', async () => {
    const { repository, google, sync } = setup();
    repository.connect('anya');

    await sync.syncTask(TASK_ID);

    expect(google.calls).toEqual([]);
  });

  it('counts failures and pauses on the 5th (FR-35)', async () => {
    const { repository, google, sync, addTask } = setup();
    const connection = repository.connect('anya');
    addTask();
    google.failNext(new Error('503 Service Unavailable'), FAILURES_BEFORE_PAUSE);

    for (let attempt = 1; attempt < FAILURES_BEFORE_PAUSE; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one retry after another, like the dispatcher
      await expect(sync.syncTask(TASK_ID)).rejects.toThrow('503 Service Unavailable');
    }
    expect(connection).toMatchObject({ syncStatus: 'ok', failedAttempts: 4 });

    await expect(sync.syncTask(TASK_ID)).rejects.toThrow('503 Service Unavailable');
    expect(connection).toMatchObject({
      syncStatus: 'paused',
      lastError: '503 Service Unavailable',
    });
  });

  it('skips a paused calendar instead of failing again', async () => {
    const { repository, google, sync, addTask } = setup();
    repository.connect('anya', { syncStatus: 'paused' });
    addTask();

    await sync.syncTask(TASK_ID);

    expect(google.calls).toEqual([]);
  });

  it('pauses at once on revoked access and does not ask for a retry', async () => {
    const { repository, google, sync, addTask } = setup();
    const connection = repository.connect('anya');
    addTask();
    google.failNext(new CalendarAccessRevoked());

    await sync.syncTask(TASK_ID);

    expect(connection.syncStatus).toBe('paused');
  });

  it('resets the failure count after a success', async () => {
    const { repository, google, sync, addTask } = setup();
    const connection = repository.connect('anya');
    addTask();
    google.failNext(new Error('timeout'), 2);
    await expect(sync.syncTask(TASK_ID)).rejects.toThrow('timeout');
    await expect(sync.syncTask(TASK_ID)).rejects.toThrow('timeout');

    await sync.syncTask(TASK_ID);

    expect(connection).toMatchObject({ failedAttempts: 0, lastError: null, syncStatus: 'ok' });
  });

  it('turns the links of a task being deleted into events to discard', async () => {
    const { repository, published, listeners, addTask, sync } = setup();
    repository.connect('anya');
    addTask();
    await sync.syncTask(TASK_ID);

    await listeners.get('task.deleted')?.({ taskId: TASK_ID } as never, 'tx' as never);

    expect(published).toEqual([
      ['calendar.eventDiscarded', { connectionId: 'c-anya', externalEventId: EVENT_ID }],
    ]);
  });

  it('deletes a discarded event, or does nothing once the connection is gone', async () => {
    const { repository, google, sync, addTask } = setup();
    repository.connect('anya');
    addTask();
    await sync.syncTask(TASK_ID);

    await sync.deleteEvent('c-anya', EVENT_ID);
    await sync.deleteEvent('c-gone', EVENT_ID);

    expect(google.events.get('cal-anya')?.size).toBe(0);
    expect(google.calls).toEqual(['upsert', 'delete']);
  });

  it('resync adds missing events and removes ones without a link', async () => {
    const { repository, google, sync, addTask } = setup();
    repository.connect('anya');
    addTask();
    google.events.set('cal-anya', new Map([['leftover', {} as CalendarEvent]]));

    await sync.resync('anya');

    expect([...(google.events.get('cal-anya')?.keys() ?? [])]).toEqual([EVENT_ID]);
  });
});
