import { useState } from 'react';

import { useCurrentGroup } from '../groups/useCurrentGroup';

const storageKey = (groupId: string) => `errandly-onboarding-hidden-${groupId}`;

function isHidden(groupId: string): boolean {
  try {
    return localStorage.getItem(storageKey(groupId)) === '1';
  } catch {
    return false;
  }
}

/** Whether to show "first steps": to the admin of a new group while nobody is invited or there are no tasks */
export function useOnboardingVisible(taskCount: number): {
  visible: boolean;
  hide: () => void;
} {
  const { group, isAdmin } = useCurrentGroup();
  const [hidden, setHidden] = useState(() => isHidden(group.id));
  const incomplete = group.members.length < 2 || taskCount === 0;
  const hide = () => {
    try {
      localStorage.setItem(storageKey(group.id), '1');
    } catch {
      // Not critical
    }
    setHidden(true);
  };
  return { visible: isAdmin && incomplete && !hidden, hide };
}
