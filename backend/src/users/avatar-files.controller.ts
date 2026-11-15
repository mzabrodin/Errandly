import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { requireFound } from '../common/errors/require-found.js';
import { Public } from '../common/http/auth.js';
import { AvatarsService } from './avatars.service.js';

/** Keys are random and change on every upload, so files can be public and cached forever */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('avatars')
export class AvatarFilesController {
  constructor(private readonly avatars: AvatarsService) {}

  @Get(':file')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async file(@Param('file') file: string): Promise<StreamableFile> {
    const object = requireFound(await this.avatars.open(file));
    return new StreamableFile(object.body, {
      type: object.contentType,
      ...(object.size !== undefined && { length: object.size }),
    });
  }
}
