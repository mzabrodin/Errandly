import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { DomainError } from '../common/errors/domain-error.js';
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
    const object = await this.avatars.open(file);
    if (!object) throw new DomainError('NOT_FOUND');
    return new StreamableFile(object.body, {
      type: object.contentType,
      ...(object.size !== undefined && { length: object.size }),
    });
  }
}
