import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { RequestHandler } from 'express';

import type { ApiErrorDto } from './errors/api-error.dto.js';

/**
 * Nest closes in this order: onModuleDestroy (here: refuse new requests), beforeApplicationShutdown
 * (jobs and the event dispatcher finish their run), the HTTP server closes once the requests in
 * flight are answered, onApplicationShutdown (SMTP, S3, then the pool).
 */
@Injectable()
export class ShutdownState implements OnModuleDestroy {
  private readonly logger = new Logger('Shutdown');
  private closing = false;

  get isClosing(): boolean {
    return this.closing;
  }

  onModuleDestroy(): void {
    this.closing = true;
    this.logger.log('Shutting down: refusing new requests, finishing the ones in flight');
  }
}

/** New requests during shutdown: 503, and the connection is not kept for another one */
export function shutdownGate(state: ShutdownState): RequestHandler {
  const body: ApiErrorDto = { code: 'SERVICE_UNAVAILABLE' };
  return (_request, response, next) => {
    if (!state.isClosing) {
      next();
      return;
    }
    response.setHeader('Connection', 'close');
    response.status(503).json(body);
  };
}

/** A hook that hangs must not keep the process past Docker's grace period */
export function armShutdownDeadline(
  timeoutMs: number,
  logger: Pick<Logger, 'error'>,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  const timer = setTimeout(() => {
    logger.error(`Shutdown took longer than ${timeoutMs} ms, exiting`);
    exit(1);
  }, timeoutMs);
  timer.unref();
}
