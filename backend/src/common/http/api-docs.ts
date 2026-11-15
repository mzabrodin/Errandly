import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiDefaultResponse, ApiProperty } from '@nestjs/swagger';

import { ApiErrorDto } from '../errors/api-error.dto.js';

/** The codes per endpoint are listed in each handler's JSDoc */
export function ApiErrorResponses(): ClassDecorator & MethodDecorator {
  return ApiDefaultResponse({ type: ApiErrorDto, description: 'Error: { code, fields?, ... }' });
}

export function ApiSession(): ClassDecorator & MethodDecorator {
  return applyDecorators(ApiCookieAuth(), ApiErrorResponses());
}

/** A named enum schema, so the frontend gets one shared type (e.g. `GroupRole`) */
export function ApiEnum(
  values: readonly string[],
  name: string,
  options: { required?: boolean } = {},
): PropertyDecorator {
  return ApiProperty({ enum: values, enumName: name, ...options });
}
