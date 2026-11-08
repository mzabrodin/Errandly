import { Module } from '@nestjs/common';

import { AccountController } from './account.controller.js';
import { AuthController } from './auth.controller.js';
import { PasswordHasher, ScryptPasswordHasher } from './password-hasher.js';

@Module({
  controllers: [AuthController, AccountController],
  providers: [{ provide: PasswordHasher, useClass: ScryptPasswordHasher }],
  exports: [PasswordHasher],
})
export class AuthModule {}
