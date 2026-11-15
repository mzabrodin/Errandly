import { IsIn, IsOptional } from 'class-validator';

import { STATS_PERIODS, type StatsPeriod } from '../../common/domain.js';
import { ApiEnum } from '../../common/http/api-docs.js';
import { code } from '../../common/validation/validation.js';

/** One member's numbers for the period; every current member is listed, zeros included */
export class MemberStatsDto {
  userId!: string;
  /** Completed tasks in the period */
  done!: number;
  overdue!: number;
  /** Sum of the difficulty of completed tasks */
  difficulty!: number;
}

export class StatsQueryDto {
  /** The last 7 (week, default) or 30 (month) days */
  @ApiEnum(STATS_PERIODS, 'StatsPeriod', { required: false })
  @IsOptional()
  @IsIn(STATS_PERIODS, code('invalid'))
  period?: StatsPeriod;
}
