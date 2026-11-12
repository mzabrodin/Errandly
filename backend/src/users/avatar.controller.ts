import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { LIMITS } from '../common/domain.js';
import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { AvatarsService } from './avatars.service.js';
import { AvatarUploadDto } from './dto/profile.dto.js';
import { UserDto } from './dto/user.dto.js';

interface UploadedImage {
  buffer: Buffer;
}

/** The signed-in user's own photo */
@ApiTags('me')
@ApiSession()
@Controller('me/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarsService) {}

  /** Uploads a JPEG, PNG, WebP or GIF (field `file`). Errors: 400 VALIDATION (file required/type), 413 FILE_TOO_LARGE. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.avatarBytes, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AvatarUploadDto })
  uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<UserDto> {
    return this.avatars.upload(user.id, file?.buffer);
  }

  /** Removes the uploaded photo; the Google photo or initials show again. */
  @Delete()
  deleteAvatar(@CurrentUser() user: RequestUser): Promise<UserDto> {
    return this.avatars.remove(user.id);
  }
}
