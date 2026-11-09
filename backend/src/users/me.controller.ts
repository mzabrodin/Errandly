import { Body, Controller, Delete, HttpCode, HttpStatus, Patch, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { clearSessionCookie, secureCookies } from '../common/http/session-cookie.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { UpdateProfileDto } from './dto/profile.dto.js';
import { UserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

/** The signed-in user's profile and account */
@ApiTags('me')
@ApiSession()
@Controller('me')
export class MeController {
  private readonly secure: boolean;

  constructor(
    private readonly users: UsersService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secure = secureCookies(config);
  }

  /** Updates name, time zone or language. Errors: 400 VALIDATION (name required/tooLong, timezone invalid, locale invalid). */
  @Patch()
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() body: UpdateProfileDto,
  ): Promise<UserDto> {
    return this.users.updateProfile(user.id, body);
  }

  /**
   * Deletes the account and ends the session; open tasks are redistributed.
   * Errors: 409 LAST_ADMIN (+groups: names of groups where the user is the only admin).
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.users.deleteAccount(user.id);
    clearSessionCookie(response, this.secure);
  }
}
