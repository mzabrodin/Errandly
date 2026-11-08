import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../common/http/api-docs.js';
import { notImplemented, ParseId } from '../common/http/stubs.js';
import { AcceptInviteDto, CreateInviteDto, InviteDto, InviteInfoDto } from './dto/group.dto.js';

/** Invite links (FR-11–13, SD-2). Tokens never appear in the logs (see redact-url.ts). */
@ApiTags('invites')
@ApiErrorResponses()
@Controller()
export class InvitesController {
  /** Creates a 7-day invite link and optionally emails it (admin). Errors: 403 ADMIN_ONLY. */
  @Post('groups/:groupId/invites')
  @ApiCookieAuth()
  create(
    @Param('groupId', ParseId) groupId: string,
    @Body() body: CreateInviteDto,
  ): Promise<InviteDto> {
    return notImplemented(groupId, body);
  }

  /** What the invite page shows; works signed out. Errors: 410 INVITE_INVALID (unknown, revoked or expired). */
  @Get('invites/:token')
  info(@Param('token') token: string): Promise<InviteInfoDto> {
    return notImplemented(token);
  }

  /**
   * Joins the group as a member; idempotent for existing members.
   * Errors: 410 INVITE_INVALID, 403 EMAIL_NOT_VERIFIED.
   */
  @Post('invites/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  accept(@Param('token') token: string): Promise<AcceptInviteDto> {
    return notImplemented(token);
  }
}
