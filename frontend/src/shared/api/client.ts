import createClient from 'openapi-fetch';

import type { paths } from './schema';

export interface ApiErrorBody {
  code?: string;
  message?: string;
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }

  /** Error body in the backend format (an empty object if there is no body) */
  get details(): ApiErrorBody {
    return this.body !== null && typeof this.body === 'object' ? this.body : {};
  }

  get code(): string | undefined {
    return this.details.code;
  }
}

const API_ORIGIN = import.meta.env.VITE_API_URL ?? '';

// Paths, params, bodies and responses are checked against backend/openapi.json (npm run api:sync)
export const api = createClient<paths>({
  baseUrl: API_ORIGIN,
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

// Multipart uploads only (the avatar): openapi-fetch serialises bodies as JSON, while the browser
// must build multipart/form-data with its boundary itself. Everything else goes through `api`.
async function upload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_ORIGIN}/api${path}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  // The caller names the response type that openapi.json declares for this path
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic wrapper over fetch
  return body as T;
}

export const http = { upload };
