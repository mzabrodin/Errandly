import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { DomainError } from '../common/errors/domain-error.js';
import { IS_PUBLIC_KEY, setRequestUser } from '../common/http/auth.js';
import {
  readSessionCookie,
  secureCookies,
  setSessionCookie,
} from '../common/http/session-cookie.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { SessionService } from './sessions.service.js';

/**
 * Global guard (APP_GUARD), default-deny: every route needs a valid session unless it is
 * marked @Public() (SYS-07). Public routes still learn who is calling when a cookie is sent.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly secure: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secure = secureCookies(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;

    const authenticated = await this.sessions.authenticate(readSessionCookie(request));
    if (authenticated) {
      setRequestUser(request, authenticated.user);
      if (authenticated.refreshed) {
        setSessionCookie(http.getResponse<Response>(), authenticated.refreshed, this.secure);
      }
      return true;
    }
    if (isPublic) return true;
    throw new DomainError('UNAUTHENTICATED');
  }
}
