import { Module } from '@nestjs/common';

import { AccountController } from './account.controller.js';
import { AuthController } from './auth.controller.js';
import { Argon2PasswordHasher, PasswordHasher } from './password-hasher.js';

@Module({
  controllers: [AuthController, AccountController],
  providers: [{ provide: PasswordHasher, useFactory: () => new Argon2PasswordHasher() }],
  exports: [PasswordHasher],
})
export class AuthModule {}
