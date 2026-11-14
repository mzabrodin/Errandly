import type TestAgent from 'supertest/lib/agent.js';

import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Person {
  id: string;
  agent: TestAgent;
}

describe('Stats (integration)', () => {
  let t: TestApp;
  let anya: Person;
  let bohdan: Person;
  let groupId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    // IsFutureDate checks against the real time, so the app clock follows it here
    t.clock.set(new Date());
    anya = await person('Аня');
    bohdan = await person('Богдан');
    groupId = (await anya.agent.post('/api/groups').send({ name: 'Room 12' }).expect(201)).body.id;
    const invite = await anya.agent.post(`/api/groups/${groupId}/invites`).send({}).expect(201);
    const token = new URL(invite.body.url).pathname.split('/').at(-1) ?? '';
    await bohdan.agent.post(`/api/invites/${token}/accept`).expect(200);
  });

  afterAll(async () => {
    await t.close();
  });

  async function person(name: string): Promise<Person> {
    const user = await createUser(t.db, { name });
    return { id: user.id, agent: await signIn(t, user.email) };
  }

  async function task(owner: Person, inHours: number, difficulty: number): Promise<string> {
    const { body } = await anya.agent
      .post(`/api/groups/${groupId}/tasks`)
      .send({
        title: 'Take out the trash',
        description: '',
        dueAt: new Date(t.clock.now().getTime() + inHours * HOUR).toISOString(),
        difficulty,
        recurrence: { type: 'once' },
        assigneeId: owner.id,
      })
      .expect(201);
    return body.id;
  }

  it('counts each member’s done and overdue tasks of the last week or month (FR-39)', async () => {
    const done = await task(anya, 1, 4);
    await task(bohdan, 2, 2);
    await task(bohdan, 3, 1);
    await anya.agent.post(`/api/tasks/${done}/complete`).expect(200);
    t.clock.advance(10 * DAY);
    await task(anya, 1, 5);
    t.clock.advance(2 * HOUR);

    const week = await anya.agent.get(`/api/groups/${groupId}/stats`).expect(200);
    const month = await bohdan.agent.get(`/api/groups/${groupId}/stats?period=month`).expect(200);

    expect(week.body).toEqual(
      expect.arrayContaining([
        { userId: anya.id, done: 0, overdue: 1, difficulty: 0 },
        { userId: bohdan.id, done: 0, overdue: 0, difficulty: 0 },
      ]),
    );
    expect(month.body).toEqual(
      expect.arrayContaining([
        { userId: anya.id, done: 1, overdue: 1, difficulty: 4 },
        { userId: bohdan.id, done: 0, overdue: 2, difficulty: 0 },
      ]),
    );
  });

  it('shows the statistics only to members of the group (FR-40)', async () => {
    const outsider = await person('Чужий');

    await outsider.agent
      .get(`/api/groups/${groupId}/stats`)
      .expect(403)
      .expect({ code: 'FORBIDDEN' });
    await anya.agent
      .get(`/api/groups/${groupId}/stats?period=year`)
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { period: 'invalid' } });
  });
});
