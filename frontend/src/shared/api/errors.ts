import type { TFunction } from 'i18next';

import { ApiError } from './client';

/** Зрозуміле повідомлення без технічних подробиць (NFR-REL-07) */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return t('errors.forbidden');
    return t('errors.unknown');
  }
  if (error instanceof TypeError) return t('errors.network');
  return t('errors.unknown');
}

export function isApiError(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code;
}
