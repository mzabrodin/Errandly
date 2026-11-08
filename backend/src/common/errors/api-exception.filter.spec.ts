import {
  BadRequestException,
  Logger,
  NotFoundException,
  NotImplementedException,
  PayloadTooLargeException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Mock } from 'vitest';

import {
  ApiExceptionFilter,
  errorCodeOf,
  postgresErrorCode,
  toApiError,
} from './api-exception.filter.js';
import { DomainError } from './domain-error.js';

function hostFor(response: object): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

interface FakeResponse {
  status: Mock<(status: number) => FakeResponse>;
  json: Mock<(body: unknown) => void>;
}

function respond(exception: unknown): FakeResponse {
  const response: FakeResponse = {
    status: vi.fn<(status: number) => FakeResponse>(),
    json: vi.fn<(body: unknown) => void>(),
  };
  response.status.mockReturnValue(response);
  new ApiExceptionFilter().catch(exception, hostFor(response));
  return response;
}

describe('toApiError', () => {
  it('keeps contract errors as they are', () => {
    const exception = new DomainError('ACCOUNT_LOCKED', { retryAfterSeconds: 900 });
    expect(toApiError(exception)).toEqual({
      status: 423,
      body: { code: 'ACCOUNT_LOCKED', retryAfterSeconds: 900 },
    });
  });

  it.each([
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new PayloadTooLargeException(), 413, 'FILE_TOO_LARGE'],
    [new NotImplementedException(), 501, 'NOT_IMPLEMENTED'],
    [new BadRequestException('Unexpected token in JSON'), 400, 'VALIDATION'],
  ])('maps %o to %i %s', (exception, status, code) => {
    expect(toApiError(exception)).toEqual({ status, body: { code } });
  });

  it('turns constraint violations into 409 CONFLICT, also when Drizzle wraps them', () => {
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const wrapped = new Error('Failed query', { cause: pgError });

    expect(toApiError(pgError)).toEqual({ status: 409, body: { code: 'CONFLICT' } });
    expect(toApiError(wrapped)).toEqual({ status: 409, body: { code: 'CONFLICT' } });
    expect(postgresErrorCode(new Error('plain'))).toBeUndefined();
  });

  it('hides unexpected errors behind INTERNAL', () => {
    expect(toApiError(new Error('connection refused'))).toEqual({
      status: 500,
      body: { code: 'INTERNAL' },
    });
  });
});

describe('ApiExceptionFilter', () => {
  it('writes the contract body and remembers the code for the request log', () => {
    const response = respond(new DomainError('LAST_ADMIN', { groups: ['Room 12'] }));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ code: 'LAST_ADMIN', groups: ['Room 12'] });
    expect(errorCodeOf(response)).toBe('LAST_ADMIN');
  });

  it('logs unexpected errors with their stack', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const response = respond(new Error('boom'));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(log).toHaveBeenCalledWith('boom', expect.stringContaining('Error: boom'));
    log.mockRestore();
  });
});
