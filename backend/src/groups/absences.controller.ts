import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented, ParseId } from '../common/http/stubs.js';
import { CreateAbsenceDto } from './dto/group.dto.js';

/** The caller's own absences in a group (FR-15, FR-29) */
@ApiTags('groups')
@ApiSession()
@Controller('groups/:groupId/absences')
export class AbsencesController {
  /**
   * Adds an absence; the caller's automatically assigned open tasks in that period are reassigned.
   * Errors: 400 VALIDATION (to beforeFrom), 403 FORBIDDEN.
   */
  @Post()
  @ApiCreatedResponse({ description: 'Created; the body is empty' })
  create(
    @Param('groupId', ParseId) groupId: string,
    @Body() body: CreateAbsenceDto,
  ): Promise<void> {
    return notImplemented(groupId, body);
  }

  /** Deletes one of the caller's absences. */
  @Delete(':absenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('groupId', ParseId) groupId: string,
    @Param('absenceId', ParseId) absenceId: string,
  ): Promise<void> {
    return notImplemented(groupId, absenceId);
  }
}
