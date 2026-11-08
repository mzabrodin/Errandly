import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { ChangePasswordDto } from './dto/auth.dto.js';

/** Credentials of the signed-in user; the auth module owns passwords, not the users module */
@ApiTags('me')
@ApiSession()
@Controller('me')
export class AccountController {
  /** Changes the password. Errors: 400 WRONG_PASSWORD, 400 VALIDATION (newPassword weak). */
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@Body() body: ChangePasswordDto): Promise<void> {
    return notImplemented(body);
  }
}
