import type { Logger } from '@nestjs/common';

import { requireFound } from './errors/require-found.js';
import { ExclusiveRunner } from './exclusive-runner.js';
import { firstName } from './names.js';

const noop = (): void => undefined;

function setup() {
  const warnings: string[] = [];
  const logger = { warn: (message: string) => warnings.push(message) } as unknown as Logger;
  return { runner: new ExclusiveRunner(logger, 'Top-up'), warnings };
}

describe('ExclusiveRunner', () => {
  it('skips a tick while the previous run is still going, and waits for it on idle()', async () => {
    const { runner } = setup();
    let release = noop;
    let runs = 0;
    const job = () => {
      runs += 1;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    const first = runner.run(job);
    await runner.run(job);
    const idle = runner.idle();
    release();
    await Promise.all([first, idle]);

    expect(runs).toBe(1);
    await runner.run(() => Promise.resolve());
  });

  it('logs a failure instead of throwing, so the next tick tries again', async () => {
    const { runner, warnings } = setup();

    await runner.run(() => Promise.reject(new Error('database is down')));
    await runner.run(() => Promise.reject('plain text'));

    expect(warnings).toEqual(['Top-up failed: database is down', 'Top-up failed: plain text']);
    await expect(runner.idle()).resolves.toBeUndefined();
  });
});

describe('requireFound', () => {
  it('passes a value through and turns a missing one into a domain error', () => {
    expect(requireFound(0)).toBe(0);
    expect(() => requireFound(undefined)).toThrow('NOT_FOUND');
    expect(() => requireFound(null, 'UNAUTHENTICATED')).toThrow('UNAUTHENTICATED');
  });
});

describe('firstName', () => {
  it('is the first word of the name', () => {
    expect(firstName('  Anya Kovalenko ')).toBe('Anya');
    expect(firstName('Oleh')).toBe('Oleh');
  });
});
