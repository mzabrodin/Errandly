import { useContext, useMemo } from 'react';

import { useSession } from '../../shared/api/auth';
import type { Group, Member, User } from '../../shared/api/types';
import { GroupContext } from './groupContext';

interface CurrentGroup {
  group: Group;
  me: User;
  isAdmin: boolean;
  membersById: Map<string, Member>;
}

/** Поточна група (завантажує GroupLayout) і зручні похідні дані */
export function useCurrentGroup(): CurrentGroup {
  const group = useContext(GroupContext);
  const { data: user } = useSession();

  const value = useMemo((): CurrentGroup | null => {
    if (!group || !user) return null;
    const membersById = new Map<string, Member>(
      group.members.map((member) => [member.userId, member]),
    );
    return {
      group,
      me: user,
      isAdmin: group.role === 'admin',
      membersById,
    };
  }, [group, user]);

  if (!value) throw new Error('useCurrentGroup must be used inside GroupLayout');
  return value;
}
