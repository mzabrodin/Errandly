import type { Request, Response } from 'express';

import { armShutdownDeadline, shutdownGate, ShutdownState } from './shutdown.js';

function respond(state: ShutdownState) {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  const next = vi.fn<() => void>();
  shutdownGate(state)({} as Request, response as unknown as Response, next);
  return { response, headers, next };
}

describe('shutdownGate', () => {
  it('lets requests through until the shutdown starts', () => {
    const { next, response } = respond(new ShutdownState());

    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
  });

  it('then answers 503 and closes the connection', () => {
    const state = new ShutdownState();
    state.onModuleDestroy();

    const { next, response, headers } = respond(state);

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ code: 'SERVICE_UNAVAILABLE' });
    expect(headers).toEqual({ Connection: 'close' });
  });
});

describe('armShutdownDeadline', () => {
  it('exits with 1 when the shutdown outlives the deadline', () => {
    vi.useFakeTimers();
    const exit = vi.fn<(code: number) => void>();
    const error = vi.fn<(message: string) => void>();

    armShutdownDeadline(20_000, { error }, exit);
    vi.advanceTimersByTime(19_999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith('Shutdown took longer than 20000 ms, exiting');
    vi.useRealTimers();
  });
});
