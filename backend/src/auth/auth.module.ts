import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { MailModule } from '../mail/index.js';
import { UsersModule } from '../users/index.js';
import { AccountController } from './account.controller.js';
import { AuthEmails } from './auth-emails.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { Argon2PasswordHasher, PasswordHasher } from './password-hasher.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './sessions.service.js';

@Module({
  imports: [UsersModule, MailModule],
  controllers: [AuthController, AccountController, GoogleAuthController],
  providers: [
    { provide: PasswordHasher, useFactory: () => new Argon2PasswordHasher() },
    AuthRepository,
    SessionService,
    AuthService,
    AuthEmails,
    // Default-deny for the whole API: routes opt out with @Public() (SYS-07)
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
