import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { FixedClock } from './clock.js';
import { DataRetention, type Purge } from './retention.js';

const NOW = new Date('2026-11-15T03:00:00Z');

function setup(enabled = true) {
  const config = { get: () => enabled } as unknown as ConfigService<EnvironmentVariables, true>;
  return new DataRetention(new FixedClock(NOW), config);
}

describe('DataRetention', () => {
  it('runs every module purge with the current time and adds up what went', async () => {
    const retention = setup();
    const seen: Date[] = [];
    retention.register('auth', (now) => {
      seen.push(now);
      return Promise.resolve({ sessions: 2, email_tokens: 0 });
    });
    retention.register('groups', () => Promise.resolve({ invites: 1 }));

    await expect(retention.purge()).resolves.toEqual({ sessions: 2, email_tokens: 0, invites: 1 });
    expect(seen).toEqual([NOW]);
  });

  it('keeps going when one module fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const retention = setup();
    retention.register('auth', () => Promise.reject(new Error('deadlock')));
    retention.register('groups', () => Promise.resolve({ invites: 1 }));

    await expect(retention.purge()).resolves.toEqual({ invites: 1 });
    expect(warn).toHaveBeenCalledWith('Purging auth data failed: deadlock');
    warn.mockRestore();
  });

  it('refuses a second purge for the same module', () => {
    const retention = setup();
    retention.register('auth', () => Promise.resolve({}));

    expect(() => retention.register('auth', () => Promise.resolve({}))).toThrow(
      'A purge for "auth" is registered twice',
    );
  });

  it('does nothing on its schedule when the scheduler is off, or once shutting down', async () => {
    const purge = vi.fn<Purge>(() => Promise.resolve({}));
    const off = setup(false);
    off.register('auth', purge);
    await off.tick();

    const stopped = setup();
    stopped.register('auth', purge);
    await stopped.beforeApplicationShutdown();
    await stopped.tick();

    expect(purge).not.toHaveBeenCalled();
  });
});
