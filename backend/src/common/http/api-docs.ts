import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiDefaultResponse } from '@nestjs/swagger';

import { ApiErrorDto } from '../errors/api-error.dto.js';

/** The codes per endpoint are listed in each handler's JSDoc */
export function ApiErrorResponses(): ClassDecorator & MethodDecorator {
  return ApiDefaultResponse({ type: ApiErrorDto, description: 'Error: { code, fields?, ... }' });
}

export function ApiSession(): ClassDecorator & MethodDecorator {
  return applyDecorators(ApiCookieAuth(), ApiErrorResponses());
}
