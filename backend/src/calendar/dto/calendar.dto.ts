import { ApiProperty } from '@nestjs/swagger';

import { SYNC_STATUSES, type SyncStatus } from '../../common/domain.js';

export class CalendarConnectDto {
  /** Google consent page; the frontend navigates to it */
  url!: string;
}

/** The calendar part of the settings page */
export class CalendarStatusDto {
  connected!: boolean;
  /** `paused` after repeated sync failures; the settings page shows a banner */
  @ApiProperty({ enum: SYNC_STATUSES, enumName: 'SyncStatus' })
  syncStatus!: SyncStatus;
  googleEmail!: string | null;
  lastSyncedAt!: string | null;
}
