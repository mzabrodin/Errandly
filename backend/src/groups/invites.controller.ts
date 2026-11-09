import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../common/http/api-docs.js';
import { CurrentUser, OptionalUser, Public, type RequestUser } from '../common/http/auth.js';
import { ParseId } from '../common/http/stubs.js';
import { AcceptInviteDto, CreateInviteDto, InviteDto, InviteInfoDto } from './dto/group.dto.js';
import { InvitesService } from './invites.service.js';

/** Invite links (FR-11–13, SD-2). Tokens never appear in the logs (see redact-url.ts). */
@ApiTags('invites')
@ApiErrorResponses()
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /** Creates a 7-day invite link and optionally emails it (admin). Errors: 403 ADMIN_ONLY. */
  @Post('groups/:groupId/invites')
  @ApiCookieAuth()
  create(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
    @Body() body: CreateInviteDto,
  ): Promise<InviteDto> {
    return this.invites.create(groupId, user.id, body.email);
  }

  /** What the invite page shows; works signed out. Errors: 410 INVITE_INVALID (unknown, revoked or expired). */
  @Get('invites/:token')
  @Public()
  info(
    @OptionalUser() user: RequestUser | null,
    @Param('token') token: string,
  ): Promise<InviteInfoDto> {
    return this.invites.info(token, user?.id ?? null);
  }

  /**
   * Joins the group as a member; idempotent for existing members.
   * Errors: 410 INVITE_INVALID, 403 EMAIL_NOT_VERIFIED.
   */
  @Post('invites/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  accept(
    @CurrentUser() user: RequestUser,
    @Param('token') token: string,
  ): Promise<AcceptInviteDto> {
    return this.invites.accept(token, user.id);
  }
}
