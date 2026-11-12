import { HttpStatus } from '@nestjs/common';

// The frontend maps these to localized messages, so renaming one is a breaking change.

/** The single place that decides the HTTP status of each code; services never pick statuses */
export const ERROR_STATUS = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  WRONG_PASSWORD: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ADMIN_ONLY: HttpStatus.FORBIDDEN,
  NOT_ASSIGNEE: HttpStatus.FORBIDDEN,
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  LAST_ADMIN: HttpStatus.CONFLICT,
  TASK_DONE: HttpStatus.CONFLICT,
  UNDO_EXPIRED: HttpStatus.CONFLICT,
  CANNOT_REMOVE_SELF: HttpStatus.CONFLICT,
  CALENDAR_NOT_CONNECTED: HttpStatus.CONFLICT,
  /** A unique or foreign-key constraint caught a race the service did not */
  CONFLICT: HttpStatus.CONFLICT,
  INVITE_INVALID: HttpStatus.GONE,
  FILE_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  ACCOUNT_LOCKED: HttpStatus.LOCKED,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
  NOT_IMPLEMENTED: HttpStatus.NOT_IMPLEMENTED,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
} as const satisfies Record<string, HttpStatus>;

export type ErrorCode = keyof typeof ERROR_STATUS;

function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_STATUS, value);
}

export const ERROR_CODES: readonly ErrorCode[] = Object.keys(ERROR_STATUS).filter(isErrorCode);

export const FIELD_CODES = [
  'required',
  'tooLong',
  'invalid',
  'weak',
  'inPast',
  'range',
  'noWeekdays',
  'beforeFrom',
  'type',
  'unknown',
] as const;
export type FieldCode = (typeof FIELD_CODES)[number];
