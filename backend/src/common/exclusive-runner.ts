import type { Logger } from '@nestjs/common';

import { errorMessage } from './errors/error-message.js';

/** One run at a time for a scheduled job: a tick that finds the last run still going is skipped */
export class ExclusiveRunner {
  private current: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly logger: Logger,
    private readonly label: string,
  ) {}

  /** A failure is logged, never thrown: the next tick simply tries again */
  run(job: () => Promise<unknown>): Promise<void> {
    if (this.current || this.stopped) return Promise.resolve();
    this.current = this.guarded(job).finally(() => {
      this.current = undefined;
    });
    return this.current;
  }

  get isStopping(): boolean {
    return this.stopped;
  }

  stop(): Promise<void> {
    this.stopped = true;
    return this.current ?? Promise.resolve();
  }

  private async guarded(job: () => Promise<unknown>): Promise<void> {
    try {
      await job();
    } catch (error: unknown) {
      this.logger.warn(`${this.label} failed: ${errorMessage(error)}`);
    }
  }
}
