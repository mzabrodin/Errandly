import type { ApiErrorDto } from './api-error.dto.js';
import type { ErrorCode } from './error-codes.js';

/** Services throw it without knowing about HTTP; ApiExceptionFilter picks the status */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Omit<ApiErrorDto, 'code'> = {},
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
