import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented, ParseId } from '../common/http/stubs.js';
import { MemberStatsDto, StatsQueryDto } from './dto/stats.dto.js';

/** Group statistics for fairness (FR-37) */
@ApiTags('stats')
@ApiSession()
@Controller('groups/:groupId/stats')
export class StatsController {
  /** Done, overdue and difficulty per member for the period. Errors: 403 FORBIDDEN. */
  @Get()
  get(
    @Param('groupId', ParseId) groupId: string,
    @Query() query: StatsQueryDto,
  ): Promise<MemberStatsDto[]> {
    return notImplemented(groupId, query);
  }
}
