import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { http } from './client';
import type { MemberStats, StatsPeriod } from './types';

export function useStats(groupId: string, period: StatsPeriod): UseQueryResult<MemberStats[]> {
  return useQuery({
    queryKey: ['stats', groupId, period],
    queryFn: () => http.get<MemberStats[]>(`/groups/${groupId}/stats?period=${period}`),
  });
}
