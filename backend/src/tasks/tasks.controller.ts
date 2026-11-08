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
  Query,
} from '@nestjs/common';
import { ApiExtraModels, ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented, ParseId } from '../common/http/stubs.js';
import { RECURRENCE_VARIANTS } from './dto/recurrence.dto.js';
import {
  CreateTaskDto,
  EditScopeQueryDto,
  ReassignTaskDto,
  TaskDto,
  TasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto.js';

/**
 * Task series and instances (FR-19–31, SD-1, SD-3). `/tasks/:taskId` routes answer 404 NOT_FOUND
 * before the access check, then 403 FORBIDDEN to non-members of the task's group.
 */
@ApiTags('tasks')
@ApiSession()
@ApiExtraModels(...RECURRENCE_VARIANTS)
@Controller()
export class TasksController {
  /** Instances in `[from, to)` by dueAt, ascending, with computed status. Errors: 403 FORBIDDEN. */
  @Get('groups/:groupId/tasks')
  list(
    @Param('groupId', ParseId) groupId: string,
    @Query() query: TasksQueryDto,
  ): Promise<TaskDto[]> {
    return notImplemented(groupId, query);
  }

  /**
   * Creates a series (admin) and materialises it 4 weeks ahead; returns the first instance.
   * `assigneeId: null` assigns every instance automatically (FR-27).
   * Errors: 403 ADMIN_ONLY, 400 VALIDATION (title required/tooLong, dueAt required/inPast,
   * difficulty range, recurrence noWeekdays).
   */
  @Post('groups/:groupId/tasks')
  create(
    @Param('groupId', ParseId) groupId: string,
    @Body() body: CreateTaskDto,
  ): Promise<TaskDto> {
    return notImplemented(groupId, body);
  }

  /** One instance. Errors: 404 NOT_FOUND, 403 FORBIDDEN. */
  @Get('tasks/:taskId')
  get(@Param('taskId', ParseId) taskId: string): Promise<TaskDto> {
    return notImplemented(taskId);
  }

  /**
   * Edits this instance (`scope=one`) or regenerates the upcoming unfinished instances of the
   * series (`scope=series`) (admin). Errors: 404 NOT_FOUND, 403 ADMIN_ONLY, 400 VALIDATION.
   */
  @Patch('tasks/:taskId')
  update(
    @Param('taskId', ParseId) taskId: string,
    @Query() query: EditScopeQueryDto,
    @Body() body: UpdateTaskDto,
  ): Promise<TaskDto> {
    return notImplemented(taskId, query, body);
  }

  /**
   * Deletes this instance or every unfinished instance of the series (admin); completed ones stay.
   * Errors: 404 NOT_FOUND, 403 ADMIN_ONLY.
   */
  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('taskId', ParseId) taskId: string,
    @Query() query: EditScopeQueryDto,
  ): Promise<void> {
    return notImplemented(taskId, query);
  }

  /** Marks the task done; only its assignee can. Idempotent. Errors: 404 NOT_FOUND, 403 NOT_ASSIGNEE. */
  @Post('tasks/:taskId/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('taskId', ParseId) taskId: string): Promise<TaskDto> {
    return notImplemented(taskId);
  }

  /**
   * Undoes the completion: the assignee within 24 hours, an admin at any time.
   * Errors: 404 NOT_FOUND, 403 NOT_ASSIGNEE, 409 UNDO_EXPIRED.
   */
  @Delete('tasks/:taskId/complete')
  undoComplete(@Param('taskId', ParseId) taskId: string): Promise<TaskDto> {
    return notImplemented(taskId);
  }

  /**
   * Assigns the task to a member by hand (admin); the algorithm never overrides it (FR-30).
   * Errors: 404 NOT_FOUND, 403 ADMIN_ONLY, 409 TASK_DONE, 400 VALIDATION (not a member).
   */
  @Patch('tasks/:taskId/assignee')
  reassign(
    @Param('taskId', ParseId) taskId: string,
    @Body() body: ReassignTaskDto,
  ): Promise<TaskDto> {
    return notImplemented(taskId, body);
  }
}
