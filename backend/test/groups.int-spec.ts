import type TestAgent from 'supertest/lib/agent.js';

import { absences, groups, invites, memberships } from '../src/groups/groups.schema.js';
import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const DAY = 24 * 60 * 60 * 1000;
const UNKNOWN_ID = '019a6f3e-0000-7000-8000-00000000dead';

interface Person {
  id: string;
  email: string;
  agent: TestAgent;
}

async function createGroup(admin: Person, name = 'Room 12'): Promise<string> {
  const { body } = await admin.agent.post('/api/groups').send({ name }).expect(201);
  return body.id;
}

async function inviteToken(admin: Person, groupId: string): Promise<string> {
  const { body } = await admin.agent.post(`/api/groups/${groupId}/invites`).send({}).expect(201);
  return new URL(body.url).pathname.split('/').at(-1) ?? '';
}

async function join(admin: Person, groupId: string, member: Person): Promise<void> {
  const token = await inviteToken(admin, groupId);
  await member.agent.post(`/api/invites/${token}/accept`).expect(200);
}

describe('Groups (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  async function person(
    name: string,
    overrides: { verified?: boolean; locale?: 'uk' | 'en' } = {},
  ) {
    const user = await createUser(t.db, { name, ...overrides });
    return { id: user.id, email: user.email, agent: await signIn(t, user.email) };
  }

  async function rowCounts() {
    const [g, m, i, a] = await Promise.all([
      t.db.$count(groups),
      t.db.$count(memberships),
      t.db.$count(invites),
      t.db.$count(absences),
    ]);
    return { groups: g, memberships: m, invites: i, absences: a };
  }

  describe('creating and reading (FR-10, FR-18, FR-40)', () => {
    it('makes the creator the admin and lists the group', async () => {
      const anya = await person('Anya');

      const { body } = await anya.agent
        .post('/api/groups')
        .send({ name: '  Room 12 ' })
        .expect(201);

      expect(body).toMatchObject({
        name: 'Room 12',
        role: 'admin',
        members: [{ userId: anya.id, name: 'Anya', role: 'admin', color: '#e6f36b', absences: [] }],
      });
      await anya.agent
        .get('/api/groups')
        .expect(200)
        .expect([{ id: body.id, name: 'Room 12', role: 'admin', memberCount: 1 }]);
    });

    it('needs a confirmed email', async () => {
      const oleh = await person('Oleh', { verified: false });

      await oleh.agent
        .post('/api/groups')
        .send({ name: 'Room 12' })
        .expect(403)
        .expect({ code: 'EMAIL_NOT_VERIFIED' });
    });
  });

  describe('access (AC-01, NFR-SEC-04, SYS-07)', () => {
    it('answers 403 without group data to outsiders and changes nothing', async () => {
      const anya = await person('Anya');
      const outsider = await person('Outsider');
      const groupId = await createGroup(anya);
      await anya.agent
        .post(`/api/groups/${groupId}/absences`)
        .send({ from: '2026-11-20', to: '2026-11-22' })
        .expect(201);
      const before = await rowCounts();

      const attempts: [string, string, object?][] = [
        ['get', `/api/groups/${groupId}`],
        ['post', `/api/groups/${groupId}/invites`, {}],
        ['delete', `/api/groups/${groupId}/members/${anya.id}`],
        ['patch', `/api/groups/${groupId}/members/${anya.id}`, { role: 'member' }],
        ['post', `/api/groups/${groupId}/leave`],
        ['post', `/api/groups/${groupId}/absences`, { from: '2026-11-20', to: '2026-11-21' }],
        ['delete', `/api/groups/${groupId}/absences/${UNKNOWN_ID}`],
        ['get', `/api/groups/${UNKNOWN_ID}`],
      ];
      for (const [method, path, body] of attempts) {
        const request =
          method === 'get'
            ? outsider.agent.get(path)
            : method === 'post'
              ? outsider.agent.post(path).send(body)
              : method === 'patch'
                ? outsider.agent.patch(path).send(body)
                : outsider.agent.delete(path);
        // oxlint-disable-next-line no-await-in-loop -- one request at a time, then one check of the database
        const response = await request;
        expect([method, path, response.status, response.body]).toEqual([
          method,
          path,
          403,
          { code: 'FORBIDDEN' },
        ]);
      }
      expect(await rowCounts()).toEqual(before);
    });

    it('answers 403 ADMIN_ONLY to members on admin actions', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);
      await join(anya, groupId, oleh);

      await oleh.agent
        .post(`/api/groups/${groupId}/invites`)
        .send({})
        .expect(403)
        .expect({ code: 'ADMIN_ONLY' });
      await oleh.agent
        .patch(`/api/groups/${groupId}/members/${oleh.id}`)
        .send({ role: 'admin' })
        .expect(403)
        .expect({ code: 'ADMIN_ONLY' });
      await oleh.agent.delete(`/api/groups/${groupId}/members/${anya.id}`).expect(403);
    });
  });

  describe('invites (FR-11–14, SD-2)', () => {
    it('lets a confirmed user join once through a link that works for 7 days', async () => {
      const anya = await person('Anya Kovalenko');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);

      const { body: invite } = await anya.agent
        .post(`/api/groups/${groupId}/invites`)
        .send({})
        .expect(201);
      expect(invite.url).toMatch(/^http:\/\/localhost:5173\/invite\/[\w-]{43}$/);
      expect(new Date(invite.expiresAt).getTime() - t.clock.now().getTime()).toBe(7 * DAY);
      const token = new URL(invite.url).pathname.split('/').at(-1) ?? '';

      await t.agent().get(`/api/invites/${token}`).expect(200).expect({
        groupId,
        groupName: 'Room 12',
        invitedBy: 'Anya Kovalenko',
        alreadyMember: false,
      });
      await oleh.agent.post(`/api/invites/${token}/accept`).expect(200).expect({ groupId });
      await oleh.agent.post(`/api/invites/${token}/accept`).expect(200).expect({ groupId });
      await oleh.agent
        .get(`/api/invites/${token}`)
        .expect(200)
        .expect((response) => expect(response.body.alreadyMember).toBe(true));

      const { body: group } = await oleh.agent.get(`/api/groups/${groupId}`).expect(200);
      expect(group.members.map((m: { name: string; color: string }) => [m.name, m.color])).toEqual([
        ['Anya Kovalenko', '#e6f36b'],
        ['Oleh', '#8ec3ea'],
      ]);
    });

    it('refuses a link created 8 days ago and adds nobody', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);
      const token = await inviteToken(anya, groupId);

      t.clock.advance(8 * DAY);

      await oleh.agent.get(`/api/invites/${token}`).expect(410).expect({ code: 'INVITE_INVALID' });
      await oleh.agent
        .post(`/api/invites/${token}/accept`)
        .expect(410)
        .expect({ code: 'INVITE_INVALID' });
      await oleh.agent.get(`/api/groups/${groupId}`).expect(403);
    });

    it('emails the recipient their own link, in their language, even after an SMTP outage', async () => {
      const anya = await person('Anya');
      const marta = await person('Marta', { locale: 'en' });
      const groupId = await createGroup(anya);

      t.mailbox.failNext();
      await anya.agent
        .post(`/api/groups/${groupId}/invites`)
        .send({ email: marta.email.toUpperCase() })
        .expect(201);
      await t.deliverEvents();
      expect(t.mailbox.sent).toHaveLength(0);

      t.clock.advance(30 * 1000);
      await t.deliverEvents();
      const [mail] = t.mailbox.to(marta.email);
      expect(mail?.subject).toBe('Anya invites you to “Room 12”');
      const token = t.mailbox.lastToken(marta.email, '/invite');
      await marta.agent.post(`/api/invites/${token}/accept`).expect(200);
    });

    it('keeps only the newest emailed link to an address working', async () => {
      const anya = await person('Anya');
      const groupId = await createGroup(anya);
      const send = async () => {
        await anya.agent
          .post(`/api/groups/${groupId}/invites`)
          .send({ email: 'friend@errandly.test' })
          .expect(201);
        await t.deliverEvents();
        return t.mailbox.lastToken('friend@errandly.test', '/invite');
      };

      const first = await send();
      const second = await send();

      await t.agent().get(`/api/invites/${first}`).expect(410);
      await t.agent().get(`/api/invites/${second}`).expect(200);
    });
  });

  describe('members and roles (FR-15–16)', () => {
    it('gives and takes the admin role but always keeps one admin', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);
      await join(anya, groupId, oleh);
      const role = (agent: TestAgent, userId: string, value: string) =>
        agent.patch(`/api/groups/${groupId}/members/${userId}`).send({ role: value });

      await role(anya.agent, anya.id, 'member').expect(409).expect({ code: 'LAST_ADMIN' });
      await role(anya.agent, oleh.id, 'admin').expect(204);
      await role(anya.agent, anya.id, 'member').expect(204);
      await role(oleh.agent, UNKNOWN_ID, 'admin').expect(404).expect({ code: 'NOT_FOUND' });

      await anya.agent
        .get('/api/groups')
        .expect((response) => expect(response.body[0].role).toBe('member'));
    });

    it('lets an admin remove someone else, but not themselves', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);
      await join(anya, groupId, oleh);

      await anya.agent
        .delete(`/api/groups/${groupId}/members/${anya.id}`)
        .expect(409)
        .expect({ code: 'CANNOT_REMOVE_SELF' });
      await anya.agent.delete(`/api/groups/${groupId}/members/${UNKNOWN_ID}`).expect(404);
      await anya.agent.delete(`/api/groups/${groupId}/members/${oleh.id}`).expect(204);

      await oleh.agent.get(`/api/groups/${groupId}`).expect(403);
      await oleh.agent.get('/api/groups').expect(200).expect([]);
    });

    it('stops the only admin from leaving others behind and deletes an empty group', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);
      await join(anya, groupId, oleh);

      await anya.agent
        .post(`/api/groups/${groupId}/leave`)
        .expect(409)
        .expect({ code: 'LAST_ADMIN' });
      await oleh.agent.post(`/api/groups/${groupId}/leave`).expect(204);
      await anya.agent.post(`/api/groups/${groupId}/leave`).expect(204);

      expect(await t.db.$count(groups)).toBe(0);
    });
  });

  describe('absences (FR-15, FR-29)', () => {
    it('adds and deletes only your own absences', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya);
      await join(anya, groupId, oleh);

      await oleh.agent
        .post(`/api/groups/${groupId}/absences`)
        .send({ from: '2026-11-20', to: '2026-11-19' })
        .expect(400)
        .expect({ code: 'VALIDATION', fields: { to: 'beforeFrom' } });
      await oleh.agent
        .post(`/api/groups/${groupId}/absences`)
        .send({ from: '2026-11-20', to: '2026-11-22' })
        .expect(201);

      const { body } = await anya.agent.get(`/api/groups/${groupId}`).expect(200);
      const [absence] = body.members[1].absences;
      expect(absence).toMatchObject({ from: '2026-11-20', to: '2026-11-22' });

      await anya.agent.delete(`/api/groups/${groupId}/absences/${absence.id}`).expect(404);
      await oleh.agent.delete(`/api/groups/${groupId}/absences/${absence.id}`).expect(204);
      await oleh.agent.delete(`/api/groups/${groupId}/absences/${absence.id}`).expect(404);
    });
  });

  describe('account deletion (NFR-LEG-02)', () => {
    it('is blocked while the user is the only admin of a group with others', async () => {
      const anya = await person('Anya');
      const oleh = await person('Oleh');
      const groupId = await createGroup(anya, 'Podil Flat');
      await join(anya, groupId, oleh);
      await createGroup(anya, 'Solo');

      await anya.agent
        .delete('/api/me')
        .expect(409)
        .expect({ code: 'LAST_ADMIN', groups: ['Podil Flat'] });
      await anya.agent.get('/api/auth/me').expect(200);

      await anya.agent
        .patch(`/api/groups/${groupId}/members/${oleh.id}`)
        .send({ role: 'admin' })
        .expect(204);
      await anya.agent.delete('/api/me').expect(204);

      const { body } = await oleh.agent.get(`/api/groups/${groupId}`).expect(200);
      expect(body.members.map((m: { name: string }) => m.name)).toEqual(['Oleh']);
      expect(await t.db.$count(groups)).toBe(1);
    });
  });
});
