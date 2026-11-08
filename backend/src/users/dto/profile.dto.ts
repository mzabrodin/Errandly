import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { LIMITS, LOCALES, type Locale } from '../../common/domain.js';
import { Trim } from '../../common/validation/transforms.js';
import { code } from '../../common/validation/validation.js';
import { IsTimeZone } from '../../common/validation/validators.js';

/** Partial profile update; omitted fields stay as they are */
export class UpdateProfileDto {
  @IsOptional()
  @Trim()
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  @MaxLength(LIMITS.userName, code('tooLong'))
  name?: string;

  /** IANA time zone, e.g. Europe/Kyiv */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiProperty({ enum: LOCALES, enumName: 'Locale', required: false })
  @IsOptional()
  @IsIn(LOCALES, code('invalid'))
  locale?: Locale;
}

/** multipart/form-data body of the avatar upload */
export class AvatarUploadDto {
  /** An image up to 512 KB */
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: unknown;
}
