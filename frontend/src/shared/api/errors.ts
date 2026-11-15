import type { TFunction } from 'i18next';

import { ApiError } from './client';
import type { components } from './schema';

type ErrorCode = components['schemas']['ErrorCode'];

// Codes a screen usually handles itself (INVALID_CREDENTIALS, EMAIL_TAKEN, ...) fall back to their status
const CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION: 'errors.validation',
  UNAUTHENTICATED: 'errors.sessionExpired',
  ADMIN_ONLY: 'errors.adminOnly',
  NOT_ASSIGNEE: 'errors.notAssignee',
  EMAIL_NOT_VERIFIED: 'errors.emailNotVerified',
  TASK_DONE: 'errors.taskDone',
  UNDO_EXPIRED: 'tasks.undoExpired',
  SWAP_STALE: 'swaps.stale',
  MEMBER_ABSENT: 'swaps.absent',
  CANNOT_REMOVE_SELF: 'errors.cannotRemoveSelf',
  CALENDAR_NOT_CONNECTED: 'errors.calendarNotConnected',
  CONFLICT: 'errors.conflict',
  FILE_TOO_LARGE: 'settings.avatar.errors.size',
};

const STATUS_MESSAGES: Partial<Record<number, string>> = {
  403: 'errors.forbidden',
  404: 'errors.notFound',
  409: 'errors.conflict',
  503: 'errors.unavailable',
};

const SECONDS_PER_MINUTE = 60;

/** A clear message without technical details (NFR-REL-07) */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return tooManyRequests(error, t);
    const code = error.code;
    const key =
      (code === undefined ? undefined : CODE_MESSAGES[code]) ?? STATUS_MESSAGES[error.status];
    return t(key ?? 'errors.unknown');
  }
  if (error instanceof TypeError) return t('errors.network');
  return t('errors.unknown');
}

function tooManyRequests(error: ApiError, t: TFunction): string {
  const seconds = error.details.retryAfterSeconds;
  if (seconds === undefined) return t('errors.tooManyRequests');
  return t('errors.tooManyRequestsWait', {
    minutes: Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE)),
  });
}

export function isApiError(error: unknown, code: ErrorCode): error is ApiError {
  return error instanceof ApiError && error.code === code;
}

export function hasStatus(error: unknown, ...statuses: number[]): error is ApiError {
  return error instanceof ApiError && statuses.includes(error.status);
}
