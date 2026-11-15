import type { TFunction } from 'i18next';

import { ApiError } from './client';
import { errorMessage, hasStatus, isApiError } from './errors';

const t = ((key: string, options?: Record<string, unknown>) =>
  options === undefined ? key : `${key} ${JSON.stringify(options)}`) as unknown as TFunction;

describe('errorMessage', () => {
  it('names the problem by its code first', () => {
    expect(errorMessage(new ApiError(409, { code: 'TASK_DONE' }), t)).toBe('errors.taskDone');
    expect(errorMessage(new ApiError(409, { code: 'SWAP_STALE' }), t)).toBe('swaps.stale');
    expect(errorMessage(new ApiError(413, { code: 'FILE_TOO_LARGE' }), t)).toBe(
      'settings.avatar.errors.size',
    );
    expect(errorMessage(new ApiError(400, { code: 'VALIDATION' }), t)).toBe('errors.validation');
  });

  it('falls back to the status, then to a generic message', () => {
    expect(errorMessage(new ApiError(404, null), t)).toBe('errors.notFound');
    expect(errorMessage(new ApiError(409, { code: 'EMAIL_TAKEN' }), t)).toBe('errors.conflict');
    expect(errorMessage(new ApiError(503, null), t)).toBe('errors.unavailable');
    expect(errorMessage(new ApiError(500, { code: 'INTERNAL' }), t)).toBe('errors.unknown');
    expect(errorMessage(new Error('boom'), t)).toBe('errors.unknown');
  });

  it('says how long to wait after too many requests, in whole minutes', () => {
    expect(
      errorMessage(new ApiError(429, { code: 'TOO_MANY_REQUESTS', retryAfterSeconds: 61 }), t),
    ).toBe('errors.tooManyRequestsWait {"minutes":2}');
    expect(
      errorMessage(new ApiError(429, { code: 'TOO_MANY_REQUESTS', retryAfterSeconds: 5 }), t),
    ).toBe('errors.tooManyRequestsWait {"minutes":1}');
    expect(errorMessage(new ApiError(429, null), t)).toBe('errors.tooManyRequests');
  });

  it('tells a lost connection apart', () => {
    expect(errorMessage(new TypeError('Failed to fetch'), t)).toBe('errors.network');
  });
});

describe('isApiError and hasStatus', () => {
  it('match the code or the status of an API error only', () => {
    const error = new ApiError(423, { code: 'ACCOUNT_LOCKED' });

    expect(isApiError(error, 'ACCOUNT_LOCKED')).toBe(true);
    expect(isApiError(error, 'TOKEN_INVALID')).toBe(false);
    expect(hasStatus(error, 403, 423)).toBe(true);
    expect(hasStatus(new Error('423'), 423)).toBe(false);
  });
});
