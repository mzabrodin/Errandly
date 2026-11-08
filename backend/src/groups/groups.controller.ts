import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented, ParseId } from '../common/http/stubs.js';
import { CreateGroupDto, GroupDto, GroupSummaryDto, UpdateMemberDto } from './dto/group.dto.js';

/**
 * Groups and their members (FR-10–18, SD-2). Group routes answer 403 FORBIDDEN to non-members,
 * also for groups that do not exist, and 403 ADMIN_ONLY to members on admin actions.
 */
@ApiTags('groups')
@ApiSession()
@Controller('groups')
export class GroupsController {
  /** Groups of the signed-in user. */
  @Get()
  list(): Promise<GroupSummaryDto[]> {
    return notImplemented();
  }

  /**
   * Creates a group with the caller as its admin.
   * Errors: 403 EMAIL_NOT_VERIFIED, 400 VALIDATION (name required/tooLong).
   */
  @Post()
  create(@Body() body: CreateGroupDto): Promise<GroupDto> {
    return notImplemented(body);
  }

  /** The group with its members and their absences. Errors: 403 FORBIDDEN. */
  @Get(':groupId')
  get(@Param('groupId', ParseId) groupId: string): Promise<GroupDto> {
    return notImplemented(groupId);
  }

  /**
   * Removes a member (admin); their open tasks are redistributed.
   * Errors: 403 ADMIN_ONLY, 409 CANNOT_REMOVE_SELF.
   */
  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('groupId', ParseId) groupId: string,
    @Param('userId', ParseId) userId: string,
  ): Promise<void> {
    return notImplemented(groupId, userId);
  }

  /**
   * Changes a member's role (admin).
   * Errors: 403 ADMIN_ONLY, 404 NOT_FOUND, 409 LAST_ADMIN.
   */
  @Patch(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateMember(
    @Param('groupId', ParseId) groupId: string,
    @Param('userId', ParseId) userId: string,
    @Body() body: UpdateMemberDto,
  ): Promise<void> {
    return notImplemented(groupId, userId, body);
  }

  /**
   * Leaves the group; the caller's open tasks are redistributed.
   * Errors: 409 LAST_ADMIN when the only admin leaves a group with other members.
   */
  @Post(':groupId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Param('groupId', ParseId) groupId: string): Promise<void> {
    return notImplemented(groupId);
  }
}
