import { Controller, Delete, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { LIMITS } from '../common/domain.js';
import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { AvatarUploadDto } from './dto/profile.dto.js';
import { UserDto } from './dto/user.dto.js';

/** The signed-in user's avatar; waits for a decision on file storage */
@ApiTags('me')
@ApiSession()
@Controller('me/avatar')
export class AvatarController {
  /** Uploads an avatar image (field `file`). Errors: 400 VALIDATION (file type), 413 FILE_TOO_LARGE. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.avatarBytes } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AvatarUploadDto })
  uploadAvatar(): Promise<UserDto> {
    return notImplemented();
  }

  /** Removes the avatar. */
  @Delete()
  deleteAvatar(): Promise<UserDto> {
    return notImplemented();
  }
}
