import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import type { Member } from '../../shared/api/types';
import { firstName } from '../../shared/lib/names';
import { Avatar } from '../../shared/ui/Avatar';

/** Avatar and first name, or "you"; the caller decides how "nobody" looks */
export function AssigneeLabel({
  member,
  size,
  isMine = false,
}: {
  member: Member;
  size: number;
  isMine?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Avatar name={member.name} src={member.avatarUrl} color={member.color} size={size} />
      {isMine ? t('common.you') : firstName(member.name)}
    </>
  );
}
