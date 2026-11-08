import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { LIMITS } from '../common/domain.js';
import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { AvatarUploadDto, UpdateProfileDto } from './dto/profile.dto.js';
import { UserDto } from './dto/user.dto.js';

/** The signed-in user's profile and avatar */
@ApiTags('me')
@ApiSession()
@Controller('me')
export class MeController {
  /** Updates name, time zone or language. Errors: 400 VALIDATION (name required/tooLong, timezone invalid, locale invalid). */
  @Patch()
  updateProfile(@Body() body: UpdateProfileDto): Promise<UserDto> {
    return notImplemented(body);
  }

  /**
   * Deletes the account and ends the session; open tasks are redistributed.
   * Errors: 409 LAST_ADMIN (+groups: names of groups where the user is the only admin).
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(): Promise<void> {
    return notImplemented();
  }

  /** Uploads an avatar image (field `file`). Errors: 400 VALIDATION (file type), 413 FILE_TOO_LARGE. */
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.avatarBytes } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AvatarUploadDto })
  uploadAvatar(): Promise<UserDto> {
    return notImplemented();
  }

  /** Removes the avatar. */
  @Delete('avatar')
  deleteAvatar(): Promise<UserDto> {
    return notImplemented();
  }
}
