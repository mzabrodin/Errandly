import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import type { GroupRole } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import { hashToken } from '../common/tokens.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database, DbExecutor } from '../db/database.js';
import type { MailService } from '../mail/index.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { AbsencesService } from './absences.service.js';
import { GroupsApi } from './groups.api.js';
import type { GroupsRepository, NewInvite } from './groups.repository.js';
import type { AbsenceRow, GroupRow, InviteRow, MembershipRow } from './groups.schema.js';
import { GroupsService } from './groups.service.js';
import { InviteEmails } from './invite-emails.js';
import { InvitesService } from './invites.service.js';

// An in-memory stand-in for GroupsRepository; the integration tests run the real queries

const NOW = new Date('2026-11-09T12:00:00.000Z');

class FakeRepository {
  groups: GroupRow[] = [];
  members: MembershipRow[] = [];
  invites: InviteRow[] = [];
  absences: AbsenceRow[] = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  insertGroup(name: string, createdBy: string) {
    const group: GroupRow = { id: this.nextId('g'), name, createdBy, createdAt: NOW };
    this.groups.push(group);
    return Promise.resolve(group);
  }

  findGroup(id: string) {
    return Promise.resolve(this.groups.find((group) => group.id === id));
  }

  deleteGroup(id: string) {
    this.groups = this.groups.filter((group) => group.id !== id);
    this.members = this.members.filter((member) => member.groupId !== id);
    return Promise.resolve();
  }

  groupsOfUser(userId: string) {
    return Promise.resolve(
      this.members
        .filter((member) => member.userId === userId)
        .map((member) => ({
          id: member.groupId,
          name: this.groups.find((group) => group.id === member.groupId)?.name ?? '',
          role: member.role,
          memberCount: this.members.filter((other) => other.groupId === member.groupId).length,
        })),
    );
  }

  findMembership(groupId: string, userId: string) {
    return Promise.resolve(
      this.members.find((member) => member.groupId === groupId && member.userId === userId),
    );
  }

  membersOf(groupId: string) {
    return Promise.resolve(this.members.filter((member) => member.groupId === groupId));
  }

  membershipsOfUser(userId: string) {
    return Promise.resolve(
      this.members
        .filter((member) => member.userId === userId)
        .map((member) =>
          Object.assign({}, member, {
            groupName: this.groups.find((group) => group.id === member.groupId)?.name ?? '',
          }),
        ),
    );
  }

  insertMembership(member: Pick<MembershipRow, 'groupId' | 'userId' | 'role' | 'color'>) {
    this.members.push({ ...member, joinedAt: NOW });
    return Promise.resolve();
  }

  updateRole(groupId: string, userId: string, role: GroupRole) {
    for (const member of this.members) {
      if (member.groupId === groupId && member.userId === userId) member.role = role;
    }
    return Promise.resolve();
  }

  deleteMembership(groupId: string, userId: string) {
    this.members = this.members.filter(
      (member) => !(member.groupId === groupId && member.userId === userId),
    );
    return Promise.resolve();
  }

  insertInvite(invite: NewInvite) {
    const row: InviteRow = { ...invite, id: this.nextId('i'), revokedAt: null, createdAt: NOW };
    this.invites.push(row);
    return Promise.resolve(row);
  }

  findInviteByHash(tokenHash: string) {
    return Promise.resolve(this.invites.find((invite) => invite.tokenHash === tokenHash));
  }

  revokeEmailInvites(groupId: string, email: string, now: Date) {
    for (const invite of this.invites) {
      if (invite.groupId === groupId && invite.email === email && invite.revokedAt === null) {
        invite.revokedAt = now;
      }
    }
    return Promise.resolve();
  }

  absencesOf(groupId: string) {
    return Promise.resolve(this.absences.filter((absence) => absence.groupId === groupId));
  }

  insertAbsence(absence: Pick<AbsenceRow, 'groupId' | 'userId' | 'startsOn' | 'endsOn'>) {
    this.absences.push({ ...absence, id: this.nextId('a'), createdAt: NOW });
    return Promise.resolve();
  }

  deleteAbsence(id: string, groupId: string, userId: string) {
    const before = this.absences.length;
    this.absences = this.absences.filter(
      (absence) => !(absence.id === id && absence.groupId === groupId && absence.userId === userId),
    );
    return Promise.resolve(this.absences.length < before);
  }
}

function user(id: string, overrides: Partial<UserDto> = {}): UserDto {
  return {
    id,
    name: id,
    email: `${id}@errandly.test`,
    emailVerified: true,
    timezone: 'Europe/Kyiv',
    timezoneAuto: true,
    locale: 'uk',
    avatarUrl: null,
    ...overrides,
  };
}

type Listener = (event: never, tx: DbExecutor) => Promise<void>;

function setup(people: UserDto[] = [user('anya'), user('oleh'), user('marta')]) {
  const repository = new FakeRepository();
  const published: [string, unknown][] = [];
  const storedOnDelete: boolean[] = [];
  const inTransaction = new Map<string, Listener>();
  const afterCommit = new Map<string, Listener>();
  const sent: { template: string; to: string; data: Record<string, string>; locale: string }[] = [];
  const bus = {
    publish: (_tx: unknown, type: string, event: unknown) => {
      published.push([type, event]);
      if (type === 'group.deleted') storedOnDelete.push(repository.groups.length > 0);
      return Promise.resolve();
    },
    onInTransaction: (type: string, listener: Listener) => inTransaction.set(type, listener),
    onAfterCommit: (_type: string, id: string, listener: Listener) => afterCommit.set(id, listener),
  } as unknown as EventBus;
  const users = {
    findById: (id: string) => Promise.resolve(people.find((p) => p.id === id) ?? null),
    findByEmail: (email: string) => Promise.resolve(people.find((p) => p.email === email) ?? null),
    findMany: (ids: string[]) =>
      Promise.resolve(new Map(people.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]))),
  } as unknown as UsersApi;
  const mail = {
    send: (template: string, to: string, data: Record<string, string>, locale: string) => {
      sent.push({ template, to, data, locale });
      return Promise.resolve('id');
    },
  } as unknown as MailService;
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx'),
  } as unknown as Database;
  const config = { get: () => 'https://errandly.app' } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  const clock = new FixedClock(NOW);
  const repo = repository as unknown as GroupsRepository;
  const access = new GroupsApi(repo);
  const groups = new GroupsService(db, repo, access, users, bus);
  const invites = new InvitesService(db, repo, access, users, bus, clock, config);
  const emails = new InviteEmails(db, repo, users, mail, bus, clock, config);
  const absences = new AbsencesService(db, repo, access, bus);
  groups.onModuleInit();
  emails.onModuleInit();
  return {
    repository,
    published,
    storedOnDelete,
    inTransaction,
    afterCommit,
    sent,
    clock,
    access,
    groups,
    invites,
    absences,
  };
}

type World = ReturnType<typeof setup>;

/** A group with Anya as its admin and the other names as members */
async function groupWith(world: World, ...memberIds: string[]): Promise<string> {
  const { id } = await world.groups.create('anya', 'Room 12');
  for (const userId of memberIds) {
    // oxlint-disable-next-line no-await-in-loop -- members join in order
    await world.repository.insertMembership({ groupId: id, userId, role: 'member', color: '#000' });
  }
  world.published.length = 0;
  return id;
}

function tokenOf(url: string): string {
  return url.split('/').at(-1) ?? '';
}

describe('GroupsApi', () => {
  it('answers FORBIDDEN to outsiders and ADMIN_ONLY to members', async () => {
    const world = setup();
    const groupId = await groupWith(world, 'oleh');

    await expect(world.access.requireMember(groupId, 'anya')).resolves.toBe('admin');
    await expect(world.access.requireMember(groupId, 'marta')).rejects.toEqual(
      new DomainError('FORBIDDEN'),
    );
    await expect(world.access.requireAdmin(groupId, 'oleh')).rejects.toEqual(
      new DomainError('ADMIN_ONLY'),
    );
  });

  it('lists members with their absences', async () => {
    const world = setup();
    const groupId = await groupWith(world, 'oleh');
    await world.absences.add(groupId, 'oleh', '2026-11-20', '2026-11-22');

    await expect(world.access.members(groupId)).resolves.toEqual([
      { userId: 'anya', role: 'admin', absences: [] },
      { userId: 'oleh', role: 'member', absences: [{ from: '2026-11-20', to: '2026-11-22' }] },
    ]);
  });
});

describe('GroupsService', () => {
  it('creates a group with the creator as admin and announces it', async () => {
    const world = setup();

    const group = await world.groups.create('anya', 'Room 12');

    expect(group).toMatchObject({
      name: 'Room 12',
      role: 'admin',
      members: [{ userId: 'anya', name: 'anya', email: 'anya@errandly.test', color: '#e6f36b' }],
    });
    expect(world.published).toEqual([['group.created', { groupId: group.id, userId: 'anya' }]]);
    await expect(world.groups.list('anya')).resolves.toEqual([
      { id: group.id, name: 'Room 12', role: 'admin', memberCount: 1 },
    ]);
  });

  it('refuses an unconfirmed email', async () => {
    const world = setup([user('anya', { emailVerified: false })]);

    await expect(world.groups.create('anya', 'Room 12')).rejects.toEqual(
      new DomainError('EMAIL_NOT_VERIFIED'),
    );
  });

  it('shows the group to members only', async () => {
    const world = setup();
    const groupId = await groupWith(world, 'oleh');

    await expect(world.groups.get(groupId, 'oleh')).resolves.toMatchObject({ role: 'member' });
    await expect(world.groups.get(groupId, 'marta')).rejects.toEqual(new DomainError('FORBIDDEN'));
  });

  describe('removing members', () => {
    it('removes someone else and announces who did it', async () => {
      const world = setup();
      const groupId = await groupWith(world, 'oleh');

      await world.groups.removeMember(groupId, 'anya', 'oleh');

      expect(world.repository.members.map((m) => m.userId)).toEqual(['anya']);
      expect(world.published).toEqual([
        ['group.memberLeft', { groupId, userId: 'oleh', removedBy: 'anya' }],
      ]);
    });

    it('refuses self-removal, non-members and non-admins', async () => {
      const world = setup();
      const groupId = await groupWith(world, 'oleh');

      await expect(world.groups.removeMember(groupId, 'anya', 'anya')).rejects.toEqual(
        new DomainError('CANNOT_REMOVE_SELF'),
      );
      await expect(world.groups.removeMember(groupId, 'anya', 'marta')).rejects.toEqual(
        new DomainError('NOT_FOUND'),
      );
      await expect(world.groups.removeMember(groupId, 'oleh', 'anya')).rejects.toEqual(
        new DomainError('ADMIN_ONLY'),
      );
    });
  });

  describe('roles', () => {
    it('changes a role and announces it, but does nothing when it is the same', async () => {
      const world = setup();
      const groupId = await groupWith(world, 'oleh');

      await world.groups.changeRole(groupId, 'anya', 'oleh', 'admin');
      await world.groups.changeRole(groupId, 'anya', 'oleh', 'admin');

      expect(world.published).toEqual([
        ['group.roleChanged', { groupId, userId: 'oleh', role: 'admin', actorId: 'anya' }],
      ]);
    });

    it('keeps the last admin and answers NOT_FOUND for non-members', async () => {
      const world = setup();
      const groupId = await groupWith(world, 'oleh');

      await expect(world.groups.changeRole(groupId, 'anya', 'anya', 'member')).rejects.toEqual(
        new DomainError('LAST_ADMIN'),
      );
      await expect(world.groups.changeRole(groupId, 'anya', 'marta', 'admin')).rejects.toEqual(
        new DomainError('NOT_FOUND'),
      );
    });
  });

  describe('leaving', () => {
    it('lets members leave and deletes the group when the last one goes', async () => {
      const world = setup();
      const groupId = await groupWith(world, 'oleh');

      await expect(world.groups.leave(groupId, 'anya')).rejects.toEqual(
        new DomainError('LAST_ADMIN'),
      );
      await world.groups.leave(groupId, 'oleh');
      await world.groups.leave(groupId, 'anya');

      expect(world.repository.groups).toEqual([]);
      expect(world.published).toEqual([
        ['group.memberLeft', { groupId, userId: 'oleh', removedBy: null }],
        ['group.memberLeft', { groupId, userId: 'anya', removedBy: null }],
        ['group.deleted', { groupId }],
      ]);
      expect(world.storedOnDelete).toEqual([true]);
    });

    it('vetoes an account deletion that would orphan a group, naming the groups', async () => {
      const world = setup();
      await groupWith(world, 'oleh');
      const deleted = world.inTransaction.get('user.deleted');

      await expect(deleted?.({ userId: 'anya' } as never, 'tx' as never)).rejects.toEqual(
        new DomainError('LAST_ADMIN', { groups: ['Room 12'] }),
      );
    });

    it('leaves every group when an account is deleted', async () => {
      const world = setup();
      const groupId = await groupWith(world, 'oleh');
      const deleted = world.inTransaction.get('user.deleted');

      await deleted?.({ userId: 'oleh' } as never, 'tx' as never);

      expect(world.repository.members.map((m) => m.userId)).toEqual(['anya']);
      expect(world.published).toEqual([
        ['group.memberLeft', { groupId, userId: 'oleh', removedBy: null }],
      ]);
    });
  });
});

describe('InvitesService', () => {
  it('creates a 7-day link and asks to email it when an address is given', async () => {
    const world = setup();
    const groupId = await groupWith(world);

    const invite = await world.invites.create(groupId, 'anya', 'friend@errandly.test');

    expect(invite.url).toMatch(/^https:\/\/errandly\.app\/invite\/[\w-]{43}$/);
    expect(invite.expiresAt).toBe('2026-11-16T12:00:00.000Z');
    expect(world.repository.invites[0]).toMatchObject({
      email: null,
      tokenHash: hashToken(tokenOf(invite.url)),
    });
    expect(world.published).toEqual([
      [
        'group.inviteEmailRequested',
        {
          groupId,
          email: 'friend@errandly.test',
          invitedBy: 'anya',
          expiresAt: invite.expiresAt,
        },
      ],
    ]);
  });

  it('describes the invite and lets confirmed users join once', async () => {
    const world = setup();
    const groupId = await groupWith(world);
    const token = tokenOf((await world.invites.create(groupId, 'anya')).url);

    await expect(world.invites.info(token, null)).resolves.toEqual({
      groupId,
      groupName: 'Room 12',
      invitedBy: 'anya',
      alreadyMember: false,
    });
    await world.invites.accept(token, 'oleh');
    await world.invites.accept(token, 'oleh');

    expect(world.repository.members.map((m) => [m.userId, m.color])).toEqual([
      ['anya', '#e6f36b'],
      ['oleh', '#8ec3ea'],
    ]);
    expect(world.published).toEqual([['group.memberJoined', { groupId, userId: 'oleh' }]]);
    await expect(world.invites.info(token, 'oleh')).resolves.toMatchObject({
      alreadyMember: true,
    });
  });

  it('refuses dead links and unconfirmed emails', async () => {
    const world = setup([user('anya'), user('new', { emailVerified: false })]);
    const groupId = await groupWith(world);
    const token = tokenOf((await world.invites.create(groupId, 'anya')).url);

    await expect(world.invites.accept(token, 'new')).rejects.toEqual(
      new DomainError('EMAIL_NOT_VERIFIED'),
    );
    await expect(world.invites.info('unknown', null)).rejects.toEqual(
      new DomainError('INVITE_INVALID'),
    );
    world.clock.advance(7 * 24 * 60 * 60 * 1000);
    await expect(world.invites.accept(token, 'new')).rejects.toEqual(
      new DomainError('INVITE_INVALID'),
    );
  });

  it('shows an empty inviter name once the inviter deleted their account', async () => {
    const world = setup();
    const groupId = await groupWith(world);
    const token = tokenOf((await world.invites.create(groupId, 'anya')).url);
    const [invite] = world.repository.invites;
    if (invite) invite.invitedBy = null;

    await expect(world.invites.info(token, null)).resolves.toMatchObject({ invitedBy: '' });
  });
});

async function emailed(world: World, groupId: string, email: string, expiresAt: string) {
  const listener = world.afterCommit.get('groups.sendInviteEmail');
  await listener?.({ groupId, email, invitedBy: 'anya', expiresAt } as never, 'tx' as never);
}

describe('InviteEmails', () => {
  it('sends the recipient their own link in their language, retiring older ones', async () => {
    const world = setup([user('anya'), user('marta', { locale: 'en' })]);
    const groupId = await groupWith(world);

    await emailed(world, groupId, 'marta@errandly.test', '2026-11-16T12:00:00.000Z');
    await emailed(world, groupId, 'marta@errandly.test', '2026-11-16T12:00:00.000Z');

    expect(world.sent).toHaveLength(2);
    expect(world.sent[1]).toMatchObject({
      template: 'invite',
      to: 'marta@errandly.test',
      locale: 'en',
      data: { inviterName: 'anya', groupName: 'Room 12' },
    });
    expect(world.repository.invites.map((invite) => invite.revokedAt === null)).toEqual([
      false,
      true,
    ]);
  });

  it('writes to strangers in the inviter language and skips dead invites', async () => {
    const world = setup([user('anya', { locale: 'en' })]);
    const groupId = await groupWith(world);

    await emailed(world, groupId, 'stranger@errandly.test', '2026-11-16T12:00:00.000Z');
    await emailed(world, groupId, 'late@errandly.test', NOW.toISOString());
    await emailed(world, 'gone', 'stranger@errandly.test', '2026-11-16T12:00:00.000Z');

    expect(world.sent.map((mail) => [mail.to, mail.locale])).toEqual([
      ['stranger@errandly.test', 'en'],
    ]);
  });
});

describe('AbsencesService', () => {
  it('adds an absence for members and announces it', async () => {
    const world = setup();
    const groupId = await groupWith(world, 'oleh');

    await world.absences.add(groupId, 'oleh', '2026-11-20', '2026-11-22');

    expect(world.published).toEqual([
      ['group.absenceAdded', { groupId, userId: 'oleh', from: '2026-11-20', to: '2026-11-22' }],
    ]);
    await expect(world.absences.add(groupId, 'marta', '2026-11-20', '2026-11-22')).rejects.toEqual(
      new DomainError('FORBIDDEN'),
    );
  });

  it('deletes only your own absence', async () => {
    const world = setup();
    const groupId = await groupWith(world, 'oleh');
    await world.absences.add(groupId, 'oleh', '2026-11-20', '2026-11-22');
    const id = world.repository.absences[0]?.id ?? '';

    await expect(world.absences.remove(groupId, 'anya', id)).rejects.toEqual(
      new DomainError('NOT_FOUND'),
    );
    await world.absences.remove(groupId, 'oleh', id);
    expect(world.repository.absences).toEqual([]);
  });
});
