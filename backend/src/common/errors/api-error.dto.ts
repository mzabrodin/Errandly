import { ApiProperty } from '@nestjs/swagger';

import { ERROR_CODES, type ErrorCode } from './error-codes.js';

/** Body of every error response */
export class ApiErrorDto {
  @ApiProperty({ enum: ERROR_CODES, enumName: 'ErrorCode' })
  code!: ErrorCode;

  /** Field code per invalid property, e.g. `{ "title": "tooLong" }` (VALIDATION only) */
  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: { type: 'string' },
    example: { title: 'tooLong' },
  })
  fields?: Record<string, string>;

  /** Seconds until the next attempt is allowed (ACCOUNT_LOCKED) */
  retryAfterSeconds?: number;

  /** Names of the groups where the user is the last admin (LAST_ADMIN on account deletion) */
  groups?: string[];
}
