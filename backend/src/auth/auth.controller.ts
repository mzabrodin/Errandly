import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ApiErrorResponses } from '../common/http/api-docs.js';
import { CurrentUser, Public, type RequestUser } from '../common/http/auth.js';
import { StrictRateLimit } from '../common/http/rate-limit.js';
import {
  clearSessionCookie,
  readSessionCookie,
  secureCookies,
  setSessionCookie,
} from '../common/http/session-cookie.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { UserDto } from '../users/index.js';
import { AuthService, type SignedIn } from './auth.service.js';
import {
  ForgotPasswordDto,
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
  private readonly secure: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secure = secureCookies(config);
  }

  /** The signed-in user. 401 UNAUTHENTICATED means "signed out". */
  @Get('me')
  @ApiCookieAuth()
  me(@CurrentUser() user: RequestUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }

  /**
   * Creates an account, signs it in and sends the verifyEmail email.
   * Errors: 400 VALIDATION (name required, email invalid, password weak), 409 EMAIL_TAKEN.
   */
  @Post('register')
  @Public()
  @StrictRateLimit()
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDto> {
    return this.signIn(await this.auth.register(body), response);
  }

  /**
   * Signs in with email and password. The 5th failure in a row locks the account for 15 minutes.
   * Errors: 401 INVALID_CREDENTIALS, 423 ACCOUNT_LOCKED (+retryAfterSeconds).
   */
  @Post('login')
  @Public()
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDto> {
    return this.signIn(await this.auth.login(body), response);
  }

  /** Ends the session and clears the cookie. */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readSessionCookie(request));
    clearSessionCookie(response, this.secure);
  }

  /** Sends a reset link (valid 1 hour, single use) if the account exists; always answers 204. */
  @Post('forgot-password')
  @Public()
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(body.email);
  }

  /**
   * Sets a new password from a reset link and signs out every session.
   * Errors: 400 TOKEN_INVALID, 400 VALIDATION (password weak).
   */
  @Post('reset-password')
  @Public()
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(body.token, body.password);
  }

  /** Confirms the email from the link (no session needed). Errors: 400 TOKEN_INVALID. */
  @Post('verify-email')
  @Public()
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: VerifyEmailDto): Promise<UserDto> {
    return this.auth.verifyEmail(body.token);
  }

  /** Sends the verification email again; does nothing once the email is confirmed. */
  @Post('verify-email/resend')
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  resendVerification(@CurrentUser() user: RequestUser): Promise<void> {
    return this.auth.requestEmailVerification(user.id);
  }

  private signIn({ user, session }: SignedIn, response: Response): UserDto {
    setSessionCookie(response, session, this.secure);
    return user;
  }
}
