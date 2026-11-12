import { MEMBER_COLORS, memberColor, type GroupRole } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';

/** NFR-SEC-08, SYS-24: an invite link works for 7 days (any number of times) */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Member {
  userId: string;
  role: GroupRole;
}

function adminCount(members: readonly Member[]): number {
  return members.filter((member) => member.role === 'admin').length;
}

/** FR-16: demoting the only admin would leave the group without one */
export function assertCanChangeRole(
  members: readonly Member[],
  target: Member,
  role: GroupRole,
): void {
  if (target.role === 'admin' && role === 'member' && adminCount(members) === 1) {
    throw new DomainError('LAST_ADMIN');
  }
}

/** Alone in the group the only admin may leave; the empty group is then deleted */
export function isLastAdminWithOthers(members: readonly Member[], userId: string): boolean {
  const self = members.find((member) => member.userId === userId);
  return self?.role === 'admin' && adminCount(members) === 1 && members.length > 1;
}

/** The first colour nobody in the group has; when all are taken, colours repeat by position */
export function pickMemberColor(taken: readonly string[]): string {
  return MEMBER_COLORS.find((color) => !taken.includes(color)) ?? memberColor(taken.length);
}

export function isInviteActive(
  invite: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): boolean {
  return invite.revokedAt === null && invite.expiresAt > now;
}
