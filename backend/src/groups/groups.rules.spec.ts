import { MEMBER_COLORS } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import {
  assertCanChangeRole,
  INVITE_TTL_MS,
  isInviteActive,
  isLastAdminWithOthers,
  pickMemberColor,
  type Member,
} from './groups.rules.js';

const anya: Member = { userId: 'anya', role: 'admin' };
const oleh: Member = { userId: 'oleh', role: 'member' };
const marta: Member = { userId: 'marta', role: 'admin' };

describe('group rules', () => {
  describe('the last admin (FR-16)', () => {
    it('cannot be demoted', () => {
      expect(() => assertCanChangeRole([anya, oleh], anya, 'member')).toThrow(
        new DomainError('LAST_ADMIN'),
      );
    });

    it('can be demoted when another admin stays, and anyone can be promoted', () => {
      expect(() => assertCanChangeRole([anya, marta], anya, 'member')).not.toThrow();
      expect(() => assertCanChangeRole([anya, oleh], oleh, 'admin')).not.toThrow();
      expect(() => assertCanChangeRole([anya, oleh], anya, 'admin')).not.toThrow();
    });

    it('cannot leave others behind, but can leave alone', () => {
      expect(isLastAdminWithOthers([anya, oleh], 'anya')).toBe(true);
      expect(isLastAdminWithOthers([anya], 'anya')).toBe(false);
      expect(isLastAdminWithOthers([anya, marta, oleh], 'anya')).toBe(false);
      expect(isLastAdminWithOthers([anya, oleh], 'oleh')).toBe(false);
      expect(isLastAdminWithOthers([anya, oleh], 'stranger')).toBe(false);
    });
  });

  describe('member colours', () => {
    it('takes the first free colour, so a leaver frees theirs', () => {
      expect(pickMemberColor([])).toBe(MEMBER_COLORS[0]);
      expect(pickMemberColor([MEMBER_COLORS[0], MEMBER_COLORS[2]])).toBe(MEMBER_COLORS[1]);
    });

    it('repeats colours by position once all are taken', () => {
      expect(pickMemberColor([...MEMBER_COLORS])).toBe(MEMBER_COLORS[0]);
      expect(pickMemberColor([...MEMBER_COLORS, MEMBER_COLORS[0]])).toBe(MEMBER_COLORS[1]);
    });
  });

  describe('invites (FR-13)', () => {
    const now = new Date('2026-11-09T12:00:00Z');

    it('work for 7 days unless revoked', () => {
      expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(isInviteActive({ expiresAt: new Date(now.getTime() + 1), revokedAt: null }, now)).toBe(
        true,
      );
      expect(isInviteActive({ expiresAt: now, revokedAt: null }, now)).toBe(false);
      expect(isInviteActive({ expiresAt: new Date(now.getTime() + 1), revokedAt: now }, now)).toBe(
        false,
      );
    });
  });
});
