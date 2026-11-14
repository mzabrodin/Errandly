import { Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import type { StatsPeriod } from '../common/domain.js';
import { GroupsApi } from '../groups/index.js';
import { TasksApi } from '../tasks/index.js';
import type { MemberStatsDto } from './dto/stats.dto.js';
import { memberStats, periodStart } from './stats.rules.js';

@Injectable()
export class StatsService {
  constructor(
    private readonly groups: GroupsApi,
    private readonly tasks: TasksApi,
    private readonly clock: Clock,
  ) {}

  async forGroup(groupId: string, userId: string, period: StatsPeriod): Promise<MemberStatsDto[]> {
    await this.groups.requireMember(groupId, userId);
    const now = this.clock.now();
    const [members, tasks] = await Promise.all([
      this.groups.members(groupId),
      this.tasks.inGroup(groupId, periodStart(period, now), now),
    ]);
    return memberStats(
      members.map((member) => member.userId),
      tasks,
      now,
    );
  }
}
