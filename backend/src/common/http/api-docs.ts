import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiDefaultResponse } from '@nestjs/swagger';

import { ApiErrorDto } from '../errors/api-error.dto.js';

/**
 * Documents the shared error body for every non-2xx answer, so the typed client
 * knows the shape of `error`. The codes per endpoint are listed in each handler's JSDoc.
 */
export function ApiErrorResponses(): ClassDecorator & MethodDecorator {
  return ApiDefaultResponse({ type: ApiErrorDto, description: 'Error: { code, fields?, ... }' });
}

/** A controller whose routes need the session cookie (401 UNAUTHENTICATED without it) */
export function ApiSession(): ClassDecorator & MethodDecorator {
  return applyDecorators(ApiCookieAuth(), ApiErrorResponses());
}
