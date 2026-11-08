import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { STATS_PERIODS, type StatsPeriod } from '../../common/domain.js';
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
  @ApiProperty({ enum: STATS_PERIODS, enumName: 'StatsPeriod', required: false })
  @IsOptional()
  @IsIn(STATS_PERIODS, code('invalid'))
  period?: StatsPeriod;
}
