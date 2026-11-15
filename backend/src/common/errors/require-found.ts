import { DomainError } from './domain-error.js';
import type { ErrorCode } from './error-codes.js';

export function requireFound<T>(value: T | null | undefined, code: ErrorCode = 'NOT_FOUND'): T {
  if (value === null || value === undefined) throw new DomainError(code);
  return value;
}
