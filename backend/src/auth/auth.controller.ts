import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiFoundResponse, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { UserDto } from '../users/index.js';
import {
  ForgotPasswordDto,
  GoogleAuthQueryDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';

/** Sign-up, sign-in and email flows (FR-01–09, SD-0). Sessions live in an HttpOnly cookie. */
@ApiTags('auth')
@ApiErrorResponses()
@Controller('auth')
export class AuthController {
  /** The signed-in user. 401 UNAUTHENTICATED means "signed out". */
  @Get('me')
  @ApiCookieAuth()
  me(): Promise<UserDto> {
    return notImplemented();
  }

  /**
   * Creates an account, signs it in and sends the verifyEmail email.
   * Errors: 400 VALIDATION (name required, email invalid, password weak), 409 EMAIL_TAKEN.
   */
  @Post('register')
  register(@Body() body: RegisterDto): Promise<UserDto> {
    return notImplemented(body);
  }

  /**
   * Signs in with email and password. The 5th failure in a row locks the account for 15 minutes.
   * Errors: 401 INVALID_CREDENTIALS, 423 ACCOUNT_LOCKED (+retryAfterSeconds).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<UserDto> {
    return notImplemented(body);
  }

  /** Ends the session and clears the cookie. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(): Promise<void> {
    return notImplemented();
  }

  /** Redirects to Google sign-in, then back to `next`. A separate flow from the calendar connection. */
  @Get('google')
  @ApiFoundResponse({ description: 'Redirect to Google' })
  google(@Query() query: GoogleAuthQueryDto): Promise<void> {
    return notImplemented(query);
  }

  /** Sends a reset link (valid 1 hour, single use) if the account exists; always answers 204. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    return notImplemented(body);
  }

  /** Sets a new password from a reset link. Errors: 400 TOKEN_INVALID, 400 VALIDATION (password weak). */
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    return notImplemented(body);
  }

  /** Confirms the email from the link. Errors: 400 TOKEN_INVALID. */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: VerifyEmailDto): Promise<UserDto> {
    return notImplemented(body);
  }

  /** Sends the verification email again. */
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  resendVerification(): Promise<void> {
    return notImplemented();
  }
}
