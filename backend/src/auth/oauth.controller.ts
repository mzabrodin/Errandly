import {
  Controller,
  createParamDecorator,
  Get,
  Param,
  Query,
  Redirect,
  Req,
  Res,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFoundResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { parse } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';

import { AUTH_PROVIDERS, type AuthProvider } from '../common/domain.js';
import { ApiErrorResponses } from '../common/http/api-docs.js';
import { Public } from '../common/http/auth.js';
import { StrictRateLimit } from '../common/http/rate-limit.js';
import { secureCookies, setSessionCookie } from '../common/http/session-cookie.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { appLink } from '../config/urls.js';
import { OAuthQueryDto } from './dto/auth.dto.js';
import { OAuthSignInService, type OAuthCallback } from './oauth-sign-in.service.js';
import { signInCallbackPath } from './oauth/oauth-sign-in.js';
import { ParseAuthProvider } from './oauth/parse-auth-provider.js';
import { SIGN_IN_STATE_TTL_MS } from './oauth/sign-in-state.js';

const NONCE_COOKIE = 'errandly_oauth_nonce';

function queryText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Read one by one: providers add their own parameters (`scope`, `authuser`…) that a DTO would reject */
const CallbackQuery = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OAuthCallback => {
    const { query } = context.switchToHttp().getRequest<Request>();
    return {
      code: queryText(query['code']),
      state: queryText(query['state']),
      error: queryText(query['error']),
    };
  },
);

/** Sign-in through an OAuth provider (FR-07), a separate flow from the calendar (SYS-06) */
@ApiTags('auth')
@ApiErrorResponses()
@ApiParam({ name: 'provider', enum: AUTH_PROVIDERS, enumName: 'AuthProvider' })
@Controller('auth/oauth/:provider')
export class OAuthController {
  private readonly appUrl: string;
  private readonly secure: boolean;

  constructor(
    private readonly oauth: OAuthSignInService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
    this.secure = secureCookies(config);
  }

  /** Redirects to the provider, which returns to the callback; on failure to /login?oauthError=. */
  @Get()
  @Public()
  @StrictRateLimit()
  @Redirect()
  @ApiFoundResponse({ description: 'Redirect to the provider' })
  start(
    @Param('provider', ParseAuthProvider) provider: AuthProvider,
    @Query() query: OAuthQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): { url: string } {
    const flow = this.oauth.start(provider, query);
    if (!flow) return { url: this.failedUrl(provider) };
    response.cookie(NONCE_COOKIE, flow.nonce, {
      ...this.nonceCookie(provider),
      maxAge: SIGN_IN_STATE_TTL_MS,
    });
    return { url: flow.url };
  }

  /** The provider's redirect: signs in and returns to `next`, or to /login?oauthError=. */
  @Get('callback')
  @Public()
  @StrictRateLimit()
  @Redirect()
  @ApiFoundResponse({ description: 'Redirect into the app' })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'error', required: false, description: 'Set when the user cancels' })
  async callback(
    @Param('provider', ParseAuthProvider) provider: AuthProvider,
    @CallbackQuery() callback: OAuthCallback,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ url: string }> {
    const nonce = readNonce(request);
    response.clearCookie(NONCE_COOKIE, this.nonceCookie(provider));
    const result = await this.oauth.complete(provider, callback, nonce);
    if (!result) return { url: this.failedUrl(provider) };
    setSessionCookie(response, result.signedIn.session, this.secure);
    return { url: appLink(this.appUrl, result.next) };
  }

  /** Lax: still sent on the provider's top-level redirect back to the callback */
  private nonceCookie(provider: AuthProvider): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      path: signInCallbackPath(provider),
    };
  }

  private failedUrl(provider: AuthProvider): string {
    return `${appLink(this.appUrl, '/login')}?oauthError=${provider}`;
  }
}

function readNonce(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) return undefined;
  const nonce = parse(header)[NONCE_COOKIE];
  return nonce === '' ? undefined : nonce;
}
