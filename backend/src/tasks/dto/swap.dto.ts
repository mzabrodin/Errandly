import { IsUUID } from 'class-validator';

import { SWAP_STATUSES, type SwapStatus } from '../../common/domain.js';
import { ApiEnum } from '../../common/http/api-docs.js';
import { code } from '../../common/validation/validation.js';

export class SwapTaskDto {
  id!: string;
  title!: string;
  /** ISO date-time, UTC */
  dueAt!: string;
  /** 1–5 */
  difficulty!: number;
}

export class SwapDto {
  id!: string;
  groupId!: string;
  @ApiEnum(SWAP_STATUSES, 'SwapStatus')
  status!: SwapStatus;
  proposerId!: string;
  recipientId!: string;
  /** The proposer's task, which the recipient would take over */
  offeredTask!: SwapTaskDto;
  /** The recipient's task, which the proposer would take over */
  requestedTask!: SwapTaskDto;
  /** ISO date-time, UTC */
  createdAt!: string;
}

export class ProposeSwapDto {
  /** Another member's open, upcoming task in the same group */
  @IsUUID('all', code('invalid'))
  requestedTaskId!: string;
}
