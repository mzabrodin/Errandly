import createClient from 'openapi-fetch';

import type { paths } from './schema';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Paths, params, bodies and responses are checked against backend/openapi.json (npm run api:sync)
export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  credentials: 'include',
});

interface ApiSuccess<T> {
  data: T;
  error?: never;
  response: Response;
}

interface ApiFailure<E> {
  data?: never;
  error: E;
  response: Response;
}

type ApiResult<T, E> = ApiSuccess<T> | ApiFailure<E>;

// openapi-fetch returns the data branch for every 2xx response, and `error: undefined`
// for an error without a body, so the status is the only reliable discriminator
function isSuccess<T, E>(result: ApiResult<T, E>): result is ApiSuccess<T> {
  return result.response.ok;
}

// Turns an error response into a thrown ApiError, so TanStack Query treats it as a failure
export async function unwrap<T, E>(request: Promise<ApiResult<T, E>>): Promise<T> {
  const result = await request;
  if (!isSuccess(result)) {
    throw new ApiError(result.response.status, result.error);
  }
  return result.data;
}
