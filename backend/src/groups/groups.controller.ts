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
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { ParseId } from '../common/http/stubs.js';
import { CreateGroupDto, GroupDto, GroupSummaryDto, UpdateMemberDto } from './dto/group.dto.js';
import { GroupsService } from './groups.service.js';

/**
 * Groups and their members (FR-10–18, SD-2). Group routes answer 403 FORBIDDEN to non-members,
 * also for groups that do not exist, and 403 ADMIN_ONLY to members on admin actions.
 */
@ApiTags('groups')
@ApiSession()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  /** Groups of the signed-in user. */
  @Get()
  list(@CurrentUser() user: RequestUser): Promise<GroupSummaryDto[]> {
    return this.groups.list(user.id);
  }

  /**
   * Creates a group with the caller as its admin.
   * Errors: 403 EMAIL_NOT_VERIFIED, 400 VALIDATION (name required/tooLong).
   */
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: CreateGroupDto): Promise<GroupDto> {
    return this.groups.create(user.id, body.name);
  }

  /** The group with its members and their absences. Errors: 403 FORBIDDEN. */
  @Get(':groupId')
  get(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
  ): Promise<GroupDto> {
    return this.groups.get(groupId, user.id);
  }

  /**
   * Removes a member (admin); their open tasks are redistributed.
   * Errors: 403 ADMIN_ONLY, 404 NOT_FOUND (not a member), 409 CANNOT_REMOVE_SELF.
   */
  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
    @Param('userId', ParseId) userId: string,
  ): Promise<void> {
    return this.groups.removeMember(groupId, user.id, userId);
  }

  /**
   * Changes a member's role (admin).
   * Errors: 403 ADMIN_ONLY, 404 NOT_FOUND, 409 LAST_ADMIN.
   */
  @Patch(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateMember(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
    @Param('userId', ParseId) userId: string,
    @Body() body: UpdateMemberDto,
  ): Promise<void> {
    return this.groups.changeRole(groupId, user.id, userId, body.role);
  }

  /**
   * Leaves the group; the caller's open tasks are redistributed. The last member leaving
   * deletes the group. Errors: 409 LAST_ADMIN when the only admin leaves a group with others.
   */
  @Post(':groupId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
  ): Promise<void> {
    return this.groups.leave(groupId, user.id);
  }
}
