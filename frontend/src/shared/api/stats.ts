import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { MemberStats, StatsPeriod } from './types';

export const statsKeys = {
  group: (groupId: string) => ['stats', groupId] as const,
  period: (groupId: string, period: StatsPeriod) => ['stats', groupId, period] as const,
};

export function useStats(groupId: string, period: StatsPeriod): UseQueryResult<MemberStats[]> {
  return useQuery({
    queryKey: statsKeys.period(groupId, period),
    queryFn: () =>
      unwrap(
        api.GET('/api/groups/{groupId}/stats', {
          params: { path: { groupId }, query: { period } },
        }),
      ),
  });
}
