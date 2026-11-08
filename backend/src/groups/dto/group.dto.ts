import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { GROUP_ROLES, LIMITS, type GroupRole } from '../../common/domain.js';
import { NormalizeEmail, Trim } from '../../common/validation/transforms.js';
import { code } from '../../common/validation/validation.js';
import { IsOnOrAfter } from '../../common/validation/validators.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GroupSummaryDto {
  id!: string;
  name!: string;
  /** The caller's role in the group */
  @ApiProperty({ enum: GROUP_ROLES, enumName: 'GroupRole' })
  role!: GroupRole;
  memberCount!: number;
}

export class AbsenceDto {
  id!: string;
  /** First day, yyyy-mm-dd (inclusive) */
  from!: string;
  /** Last day, yyyy-mm-dd (inclusive) */
  to!: string;
}

export class MemberDto {
  userId!: string;
  name!: string;
  email!: string;
  @ApiProperty({ enum: GROUP_ROLES, enumName: 'GroupRole' })
  role!: GroupRole;
  /** Hex colour of the member in the calendar */
  color!: string;
  avatarUrl!: string | null;
  absences!: AbsenceDto[];
}

export class GroupDto {
  id!: string;
  name!: string;
  /** The caller's role in the group */
  @ApiProperty({ enum: GROUP_ROLES, enumName: 'GroupRole' })
  role!: GroupRole;
  members!: MemberDto[];
}

export class CreateGroupDto {
  @Trim()
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  @MaxLength(LIMITS.groupName, code('tooLong'))
  name!: string;
}

export class UpdateMemberDto {
  @ApiProperty({ enum: GROUP_ROLES, enumName: 'GroupRole' })
  @IsIn(GROUP_ROLES, code('invalid'))
  role!: GroupRole;
}

export class CreateInviteDto {
  /** Also email the link to this address; without it the link is only returned */
  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, code('invalid'))
  email?: string;
}

export class InviteDto {
  /** Link to share: {APP_URL}/invite/{token} */
  url!: string;
  /** The link works for 7 days */
  expiresAt!: string;
}

export class InviteInfoDto {
  groupId!: string;
  groupName!: string;
  /** Name of the member who created the invite */
  invitedBy!: string;
  /** True when the signed-in user is already in the group */
  alreadyMember!: boolean;
}

export class AcceptInviteDto {
  groupId!: string;
}

/** The caller's own absence; tasks in this period are reassigned (FR-15) */
export class CreateAbsenceDto {
  /** First day, yyyy-mm-dd */
  @Matches(ISO_DATE, code('required'))
  from!: string;

  /** Last day, yyyy-mm-dd, not before `from` */
  @Matches(ISO_DATE, code('beforeFrom'))
  @IsOnOrAfter('from')
  to!: string;
}
