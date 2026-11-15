import type { Response } from 'express';

import { FixedClock } from '../common/clock.js';
import type { EventPublicationStore } from '../common/events/event-publication.store.js';
import type { ObjectStorage } from '../common/storage/object-storage.js';
import type { DatabaseHealth } from '../db/database-health.js';
import type { MailHealth } from '../mail/index.js';
import { HealthController } from './health.controller.js';
import { overallStatus } from './health.rules.js';
import { HealthService } from './health.service.js';

const NOW = new Date('2026-11-15T12:00:00Z');

function setup(mailIsUp?: () => Promise<boolean>) {
  const state = { database: true, storage: true, mail: true, overdue: 0 };
  const calls = { storage: 0 };
  const clock = new FixedClock(NOW);
  const service = new HealthService(
    { isUp: () => Promise.resolve(state.database) } as DatabaseHealth,
    {
      ping: () => {
        calls.storage += 1;
        return state.storage ? Promise.resolve() : Promise.reject(new Error('down'));
      },
    } as unknown as ObjectStorage,
    { isUp: mailIsUp ?? (() => Promise.resolve(state.mail)) } as MailHealth,
    { countOverdue: () => Promise.resolve(state.overdue) } as unknown as EventPublicationStore,
    clock,
  );
  const res = { status: vi.fn<(status: number) => void>() };
  const controller = new HealthController(service);
  return {
    state,
    calls,
    clock,
    res,
    service,
    check: () => controller.check(res as unknown as Response),
  };
}

const allUp = { database: 'up', storage: 'up', mail: 'up', events: 'up' } as const;

describe('overallStatus', () => {
  it('is down only when the database is', () => {
    expect(overallStatus(allUp)).toBe('up');
    expect(overallStatus({ ...allUp, mail: 'down', storage: 'down' })).toBe('degraded');
    expect(overallStatus({ ...allUp, database: 'down' })).toBe('down');
  });
});

describe('HealthService', () => {
  it('reports every component', async () => {
    const { check, res } = setup();

    await expect(check()).resolves.toEqual({ status: 'up', components: allUp });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('stays in rotation while mail, storage or event delivery is down', async () => {
    const { check, state, res } = setup();
    Object.assign(state, { storage: false, mail: false, overdue: 3 });

    await expect(check()).resolves.toEqual({
      status: 'degraded',
      components: { database: 'up', storage: 'down', mail: 'down', events: 'down' },
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 when the database is down', async () => {
    const { check, state, res } = setup();
    state.database = false;

    await expect(check()).resolves.toMatchObject({ status: 'down' });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('asks the external services at most every 30 seconds', async () => {
    const { service, state, calls, clock } = setup();

    await service.check();
    state.storage = false;
    await expect(service.check()).resolves.toMatchObject({ status: 'up' });
    clock.advance(30_000);
    await expect(service.check()).resolves.toMatchObject({ status: 'degraded' });
    expect(calls.storage).toBe(2);
  });

  it('counts a probe that hangs as down', async () => {
    vi.useFakeTimers();
    const { service } = setup(() => new Promise<boolean>(() => undefined));

    const report = service.check();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(report).resolves.toMatchObject({ components: { mail: 'down' } });
    vi.useRealTimers();
  });
});

describe('HealthController', () => {
  it('answers liveness without asking anything', () => {
    expect(new HealthController({} as HealthService).live()).toEqual({ status: 'up' });
  });
});
