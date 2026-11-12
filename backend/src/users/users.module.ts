import { Module } from '@nestjs/common';

import { AvatarFilesController } from './avatar-files.controller.js';
import { AvatarController } from './avatar.controller.js';
import { AvatarsService } from './avatars.service.js';
import { MeController } from './me.controller.js';
import { UsersApi } from './users.api.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [MeController, AvatarController, AvatarFilesController],
  providers: [UsersRepository, UsersService, UsersApi, AvatarsService],
  exports: [UsersApi],
})
export class UsersModule {}
