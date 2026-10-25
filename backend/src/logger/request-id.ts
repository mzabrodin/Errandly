import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// nginx sets the id; anything else from the client is replaced so it can't inject into logs
const VALID_REQUEST_ID = /^[\w-]{1,128}$/;

export function resolveRequestId(headers: IncomingHttpHeaders): string {
  const incoming = headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}
