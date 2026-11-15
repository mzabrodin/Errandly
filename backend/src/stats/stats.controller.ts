import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { ParseId } from '../common/http/parse-id.js';
import { MemberStatsDto, StatsQueryDto } from './dto/stats.dto.js';
import { StatsService } from './stats.service.js';

/** Group statistics for fairness (FR-39, FR-40) */
@ApiTags('stats')
@ApiSession()
@Controller('groups/:groupId/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** Done, overdue and difficulty per member for the period. Errors: 403 FORBIDDEN. */
  @Get()
  get(
    @CurrentUser() user: RequestUser,
    @Param('groupId', ParseId) groupId: string,
    @Query() query: StatsQueryDto,
  ): Promise<MemberStatsDto[]> {
    return this.stats.forGroup(groupId, user.id, query.period ?? 'week');
  }
}
