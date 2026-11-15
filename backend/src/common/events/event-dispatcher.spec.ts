import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { FixedClock } from '../clock.js';
import type { EventBus, RegisteredListener } from './event-bus.js';
import { EventDispatcher, MAX_ATTEMPTS, retryDelayMs } from './event-dispatcher.js';
import type { EventPublicationStore } from './event-publication.store.js';
import type { EventPublicationRow } from './event-publications.schema.js';

const NOW = '2026-11-09T10:00:00.000Z';
const noop = (): void => undefined;

function publication(overrides: Partial<EventPublicationRow> = {}): EventPublicationRow {
  return {
    id: 'p1',
    listener: 'calendar.syncTask',
    eventType: 'task.changed',
    payload: { taskId: 't1', groupId: 'g1' },
    publishedAt: new Date(NOW),
    attempts: 0,
    nextAttemptAt: new Date(NOW),
    lastError: null,
    completedAt: null,
    ...overrides,
  };
}

function setup(due: EventPublicationRow[], run?: RegisteredListener['run']) {
  const store = {
    claimDue: vi.fn<EventPublicationStore['claimDue']>().mockResolvedValue(due),
    complete: vi.fn<EventPublicationStore['complete']>().mockResolvedValue(),
    fail: vi.fn<EventPublicationStore['fail']>().mockResolvedValue(),
    release: vi.fn<EventPublicationStore['release']>().mockResolvedValue(),
  };
  const bus = {
    listener: (): RegisteredListener | undefined =>
      run ? { eventType: 'task.changed', run } : undefined,
  };
  const scheduler = {
    addInterval: vi.fn<SchedulerRegistry['addInterval']>(),
    doesExist: vi.fn<SchedulerRegistry['doesExist']>().mockReturnValue(true),
    deleteInterval: vi.fn<SchedulerRegistry['deleteInterval']>(),
  };
  const config = { get: () => 0 } as unknown as ConfigService<EnvironmentVariables, true>;
  const dispatcher = new EventDispatcher(
    store as unknown as EventPublicationStore,
    bus as unknown as EventBus,
    new FixedClock(NOW),
    config,
    scheduler as unknown as SchedulerRegistry,
  );
  return { dispatcher, store, scheduler };
}

describe('retryDelayMs', () => {
  it('backs off exponentially: 30 s, 2 min, 8 min, 32 min', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([30_000, 120_000, 480_000, 1_920_000]);
  });
});

describe('EventDispatcher', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('claims due publications with a lease and completes delivered ones', async () => {
    const run = vi.fn<RegisteredListener['run']>().mockResolvedValue();
    const { dispatcher, store } = setup([publication()], run);

    await expect(dispatcher.dispatchDue()).resolves.toBe(1);

    expect(store.claimDue).toHaveBeenCalledWith(
      new Date(NOW),
      20,
      new Date('2026-11-09T10:05:00.000Z'),
    );
    expect(run).toHaveBeenCalledWith({ taskId: 't1', groupId: 'g1' });
    expect(store.complete).toHaveBeenCalledWith('p1', new Date(NOW));
  });

  it('schedules a retry with backoff when the listener fails', async () => {
    const { dispatcher, store } = setup([publication({ attempts: 1 })], () =>
      Promise.reject(new Error('Google is down')),
    );

    await dispatcher.dispatchDue();

    expect(store.fail).toHaveBeenCalledWith(
      'p1',
      2,
      new Date(new Date(NOW).getTime() + retryDelayMs(2)),
      'Google is down',
    );
  });

  it('gives up after the last attempt', async () => {
    const { dispatcher, store } = setup([publication({ attempts: MAX_ATTEMPTS - 1 })], () =>
      Promise.reject(new Error('still down')),
    );

    await dispatcher.dispatchDue();

    expect(store.fail).toHaveBeenCalledWith('p1', MAX_ATTEMPTS, null, 'still down');
  });

  it('fails publications whose listener no longer exists', async () => {
    const { dispatcher, store } = setup([publication()]);

    await dispatcher.dispatchDue();

    expect(store.fail).toHaveBeenCalledWith(
      'p1',
      1,
      expect.any(Date),
      'No listener "calendar.syncTask" is registered',
    );
  });

  it('survives a database outage in a tick', async () => {
    const { dispatcher, store } = setup([]);
    store.claimDue.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(dispatcher.tick()).resolves.toBeUndefined();
  });

  it('does not poll when the interval is 0 and stops the poller on shutdown', async () => {
    const { dispatcher, scheduler } = setup([]);

    dispatcher.onApplicationBootstrap();
    await dispatcher.beforeApplicationShutdown();

    expect(scheduler.addInterval).not.toHaveBeenCalled();
    expect(scheduler.deleteInterval).toHaveBeenCalledWith('event-dispatcher');
  });

  it('on shutdown, finishes the delivery in flight and hands the rest of the batch back', async () => {
    let release = noop;
    const run = vi.fn<RegisteredListener['run']>(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { dispatcher, store } = setup(
      [publication({ id: 'p1' }), publication({ id: 'p2' }), publication({ id: 'p3' })],
      run,
    );

    const tick = dispatcher.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    const stopping = dispatcher.beforeApplicationShutdown();
    release();
    await Promise.all([tick, stopping]);

    expect(run).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith('p1', expect.any(Date));
    expect(store.release).toHaveBeenCalledWith(['p2', 'p3'], new Date(NOW));
  });
});
