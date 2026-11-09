import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto } from './dto/auth.dto.js';

/** Credentials of the signed-in user; the auth module owns passwords, not the users module */
@ApiTags('me')
@ApiSession()
@Controller('me')
export class AccountController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Changes the password and signs out the other sessions.
   * Errors: 400 WRONG_PASSWORD, 400 VALIDATION (newPassword weak).
   */
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: RequestUser, @Body() body: ChangePasswordDto): Promise<void> {
    return this.auth.changePassword(user, body.currentPassword, body.newPassword);
  }
}
