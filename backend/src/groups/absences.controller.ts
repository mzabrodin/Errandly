import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { ParseId } from '../common/http/stubs.js';
import { AbsencesService } from './absences.service.js';
import { CreateAbsenceDto } from './dto/group.dto.js';

/** The caller's own absences in a group (FR-15, FR-29) */
@ApiTags('groups')
@ApiSession()
@Controller('groups/:groupId/absences')
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  /**
   * Adds an absence; the caller's automatically assigned open tasks in that period are reassigned.
   * Errors: 400 VALIDATION (to beforeFrom), 403 FORBIDDEN.
   */
  @Post()
  @ApiCreatedResponse({ description: 'Created; the body is empty' })
  create(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
    @Body() body: CreateAbsenceDto,
  ): Promise<void> {
    return this.absences.add(groupId, user.id, body.from, body.to);
  }

  /** Deletes one of the caller's absences. Errors: 404 NOT_FOUND (missing or someone else's). */
  @Delete(':absenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
    @Param('absenceId', ParseId) absenceId: string,
  ): Promise<void> {
    return this.absences.remove(groupId, user.id, absenceId);
  }
}
