import { Module } from '@nestjs/common';

import { AvatarController } from './avatar.controller.js';
import { MeController } from './me.controller.js';
import { UsersApi } from './users.api.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [MeController, AvatarController],
  providers: [UsersRepository, UsersService, UsersApi],
  exports: [UsersApi],
})
export class UsersModule {}
