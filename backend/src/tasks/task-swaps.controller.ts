import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { ParseId } from '../common/http/stubs.js';
import { ProposeSwapDto, SwapDto } from './dto/swap.dto.js';
import { TaskSwaps } from './task-swaps.service.js';

/**
 * Task swaps between two members (FR-26). Only the two sides see a swap; `/swaps/:swapId` routes
 * answer 404 NOT_FOUND before 403 FORBIDDEN.
 */
@ApiTags('tasks')
@ApiSession()
@Controller()
export class TaskSwapsController {
  constructor(private readonly swaps: TaskSwaps) {}

  /** The caller's pending swaps in the group, sent and received, that can still be accepted. */
  @Get('groups/:groupId/swaps')
  list(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
  ): Promise<SwapDto[]> {
    return this.swaps.list(groupId, user.id);
  }

  /**
   * Offers the caller's task for another member's task; proposing the same pair again returns
   * the pending swap. Errors: 404 NOT_FOUND, 403 FORBIDDEN, 403 NOT_ASSIGNEE,
   * 400 VALIDATION (requestedTaskId invalid), 409 SWAP_STALE (a task is done or past due),
   * 409 MEMBER_ABSENT.
   */
  @Post('tasks/:taskId/swaps')
  propose(
    @CurrentUser() user: RequestUser,
    @Param('taskId', ParseId) taskId: string,
    @Body() body: ProposeSwapDto,
  ): Promise<SwapDto> {
    return this.swaps.propose(taskId, user.id, body.requestedTaskId);
  }

  /**
   * The recipient accepts: both tasks change hands at once and become manual assignments.
   * Idempotent. Errors: 404 NOT_FOUND, 403 FORBIDDEN, 409 SWAP_STALE, 409 MEMBER_ABSENT.
   */
  @Post('swaps/:swapId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: RequestUser,
    @Param('swapId', ParseId) swapId: string,
  ): Promise<SwapDto> {
    return this.swaps.accept(swapId, user.id);
  }

  /** The recipient declines; nothing changes hands. Idempotent. Errors: 404, 403, 409 SWAP_STALE. */
  @Post('swaps/:swapId/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: RequestUser,
    @Param('swapId', ParseId) swapId: string,
  ): Promise<SwapDto> {
    return this.swaps.decline(swapId, user.id);
  }

  /** The proposer withdraws a pending swap. Idempotent. Errors: 404, 403, 409 SWAP_STALE. */
  @Delete('swaps/:swapId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('swapId', ParseId) swapId: string,
  ): Promise<void> {
    return this.swaps.cancel(swapId, user.id);
  }
}
