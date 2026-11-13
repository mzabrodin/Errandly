import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { LIMITS, LOCALES, type Locale } from '../../common/domain.js';
import { NormalizeEmail, Trim } from '../../common/validation/transforms.js';
import { code } from '../../common/validation/validation.js';
import { IsPassword, IsTimeZone } from '../../common/validation/validators.js';

export class RegisterDto {
  @Trim()
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  @MaxLength(LIMITS.userName, code('tooLong'))
  name!: string;

  @NormalizeEmail()
  @IsEmail({}, code('invalid'))
  @MaxLength(LIMITS.email, code('tooLong'))
  email!: string;

  /** At least 8 characters with a letter and a digit (FR-01) */
  @IsPassword()
  password!: string;

  /** Current UI language; becomes the account language */
  @ApiProperty({ enum: LOCALES, enumName: 'Locale', required: false })
  @IsOptional()
  @IsIn(LOCALES, code('invalid'))
  locale?: Locale;

  /** The device's IANA time zone; becomes the profile time zone */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class LoginDto {
  @NormalizeEmail()
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  email!: string;

  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  password!: string;
}

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail({}, code('invalid'))
  email!: string;
}

export class ResetPasswordDto {
  /** Token from the reset link */
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  token!: string;

  @IsPassword()
  password!: string;
}

export class VerifyEmailDto {
  /** Token from the verification link */
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  token!: string;
}

export class GoogleAuthQueryDto {
  /** Frontend path to return to after signing in */
  @IsOptional()
  @IsString(code('type'))
  next?: string;
}

export class ChangePasswordDto {
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  currentPassword!: string;

  /** At least 8 characters with a letter and a digit (FR-01) */
  @IsPassword()
  newPassword!: string;
}
