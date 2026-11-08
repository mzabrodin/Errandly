import { ApiProperty } from '@nestjs/swagger';

import { LOCALES, type Locale } from '../../common/domain.js';

/** The signed-in account as the frontend sees it */
export class UserDto {
  id!: string;
  name!: string;
  email!: string;
  emailVerified!: boolean;
  /** IANA time zone, e.g. Europe/Kyiv */
  timezone!: string;
  /** UI and email language */
  @ApiProperty({ enum: LOCALES, enumName: 'Locale' })
  locale!: Locale;
  avatarUrl!: string | null;
}
