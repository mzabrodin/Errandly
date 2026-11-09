import type { GroupRole } from '../common/domain.js';
import type { UserDto } from '../users/index.js';
import type { GroupDto, MemberDto } from './dto/group.dto.js';
import type { AbsenceRow, GroupRow, MembershipRow } from './groups.schema.js';

export interface GroupParts {
  group: GroupRow;
  /** The caller's role */
  role: GroupRole;
  members: readonly MembershipRow[];
  absences: readonly AbsenceRow[];
  users: ReadonlyMap<string, UserDto>;
}

function toMemberDto(
  member: MembershipRow,
  absences: readonly AbsenceRow[],
  user: UserDto | undefined,
): MemberDto {
  return {
    userId: member.userId,
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: member.role,
    color: member.color,
    avatarUrl: user?.avatarUrl ?? null,
    absences: absences
      .filter((absence) => absence.userId === member.userId)
      .map((absence) => ({ id: absence.id, from: absence.startsOn, to: absence.endsOn })),
  };
}

export function toGroupDto({ group, role, members, absences, users }: GroupParts): GroupDto {
  return {
    id: group.id,
    name: group.name,
    role,
    members: members.map((member) => toMemberDto(member, absences, users.get(member.userId))),
  };
}
