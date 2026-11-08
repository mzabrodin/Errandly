import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { ApiErrorDto } from './api-error.dto.js';
import { DomainError } from './domain-error.js';
import { ERROR_STATUS, type ErrorCode } from './error-codes.js';

// Framework exceptions (routing, pipes, multer) carry only a status
const HTTP_STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'FILE_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'VALIDATION',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

// PostgreSQL SQLSTATEs that mean "a constraint caught it", not "the server broke"
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** SQLSTATE of a pg error, also when Drizzle wraps it in `cause` */
export function postgresErrorCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    const code: unknown = Reflect.get(current, 'code');
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

// The request log line picks the code up from here (see logger.module.ts)
const errorCodes = new WeakMap<object, ErrorCode>();

export function errorCodeOf(response: object): ErrorCode | undefined {
  return errorCodes.get(response);
}

/** Maps any exception to an HTTP status and a contract body */
export function toApiError(exception: unknown): { status: number; body: ApiErrorDto } {
  if (exception instanceof DomainError) {
    return {
      status: ERROR_STATUS[exception.code],
      body: { code: exception.code, ...exception.details },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = HTTP_STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION');
    return { status, body: { code } };
  }
  const sqlState = postgresErrorCode(exception);
  if (sqlState === UNIQUE_VIOLATION || sqlState === FOREIGN_KEY_VIOLATION) {
    return { status: ERROR_STATUS.CONFLICT, body: { code: 'CONFLICT' } };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: 'INTERNAL' } };
}

/**
 * The global exception handler (Spring's @RestControllerAdvice): every error leaves the API
 * as `{ code, fields?, retryAfterSeconds?, groups? }` (docs/api.md). Registered as APP_FILTER.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = toApiError(exception);

    // Expected errors are logged by the request logger; only server faults get a stack trace
    if (status >= 500 && !(exception instanceof HttpException)) {
      const error = exception instanceof Error ? exception : new Error('Non-error value thrown');
      this.logger.error(error.message, error.stack);
    }

    errorCodes.set(response, body.code);
    response.status(status).json(body);
  }
}
