import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ApiErrorDto } from '../errors/api-error.dto.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF defence next to SameSite=Lax (NFR-SEC-06); requests without Origin aren't cross-site browser requests */
export function originCheck(allowedOrigin: string): RequestHandler {
  const allowed = new URL(allowedOrigin).origin;
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    if (SAFE_METHODS.has(request.method) || origin === undefined || origin === allowed) {
      next();
      return;
    }
    const body: ApiErrorDto = { code: 'FORBIDDEN' };
    response.status(403).json(body);
  };
}
