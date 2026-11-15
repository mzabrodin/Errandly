import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CallerThrottlerGuard } from '../common/http/rate-limit.js';
import { MailModule } from '../mail/index.js';
import { UsersModule } from '../users/index.js';
import { AccountController } from './account.controller.js';
import { AuthEmails } from './auth-emails.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { OAuthSignInService } from './oauth-sign-in.service.js';
import { OAuthController } from './oauth.controller.js';
import { GoogleOAuthSignIn } from './oauth/google-oauth-sign-in.js';
import { SignInProviders } from './oauth/sign-in-providers.js';
import { Argon2PasswordHasher, PasswordHasher } from './password-hasher.js';
import { AuthenticatedGuard, SessionGuard } from './session.guard.js';
import { SessionService } from './sessions.service.js';

@Module({
  imports: [UsersModule, MailModule],
  controllers: [AuthController, AccountController, OAuthController],
  providers: [
    { provide: PasswordHasher, useFactory: () => new Argon2PasswordHasher() },
    AuthRepository,
    SessionService,
    AuthService,
    AuthEmails,
    GoogleOAuthSignIn,
    SignInProviders,
    OAuthSignInService,
    // Default-deny for the whole API: routes opt out with @Public() (SYS-07)
    // Global guards run in registration order: identify the caller, count it, then deny anonymous ones
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CallerThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
