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

  /** Тіло помилки у форматі бекенду (порожній об'єкт, якщо тіла немає) */
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

// Нетипізований клієнт для ендпоінтів, яких ще немає в openapi.json (контракт — frontend/API.md).
// Коли бекенд їх реалізує, запити переїжджають на типізований `api`.
async function httpRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  // для FormData браузер сам ставить multipart/form-data з boundary
  const isForm = init.body instanceof FormData;
  const headers = new Headers(init.headers);
  if (!isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_ORIGIN}/api${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  // нетипізований шлях: форму відповіді гарантує контракт у frontend/API.md
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic-обгортка над fetch
  return body as T;
}

export const http = {
  get: <T>(path: string): Promise<T> => httpRequest<T>(path),
  post: <T>(path: string, data?: unknown): Promise<T> =>
    httpRequest<T>(path, {
      method: 'POST',
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
  patch: <T>(path: string, data: unknown): Promise<T> =>
    httpRequest<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string): Promise<T> => httpRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData): Promise<T> =>
    httpRequest<T>(path, { method: 'POST', body: form }),
};
