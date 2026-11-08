import type { ApiErrorDto } from './api-error.dto.js';
import type { ErrorCode } from './error-codes.js';

/**
 * A business rule said no. Services throw it without knowing about HTTP:
 * `throw new DomainError('LAST_ADMIN', { groups })`. ApiExceptionFilter picks the
 * status from ERROR_STATUS and writes `{ code, ...details }`.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Omit<ApiErrorDto, 'code'> = {},
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
