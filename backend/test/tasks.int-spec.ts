import { TZDate } from '@date-fns/tz';
import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';

import { SeriesTopUp } from '../src/tasks/series-top-up.js';
import { tasks, taskSeries } from '../src/tasks/tasks.schema.js';
import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const DAY = 24 * 60 * 60 * 1000;
const UNKNOWN_ID = '019a6f3e-0000-7000-8000-00000000dead';

interface Person {
  id: string;
  agent: TestAgent;
}

interface TaskBody {
  id: string;
  dueAt: string;
  assigneeId: string | null;
  status: string;
  title: string;
}

describe('Tasks (integration)', () => {
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

  function inDays(days: number): string {
    return new Date(t.clock.now().getTime() + days * DAY).toISOString();
  }

  function taskInput(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Take out the trash',
      description: '',
      dueAt: inDays(1),
      difficulty: 2,
      recurrence: { type: 'once' },
      assigneeId: null,
      ...overrides,
    };
  }

  async function create(overrides: Record<string, unknown> = {}): Promise<TaskBody> {
    const { body } = await anya.agent
      .post(`/api/groups/${groupId}/tasks`)
      .send(taskInput(overrides))
      .expect(201);
    return body;
  }

  async function list(): Promise<TaskBody[]> {
    return (await anya.agent.get(`/api/groups/${groupId}/tasks`).expect(200)).body;
  }

  it('answers 403 with no data to outsiders on every task route (AC-01)', async () => {
    const task = await create();
    const outsider = (await person('Outsider')).agent;
    const before = await t.db.$count(tasks);

    await outsider.get(`/api/groups/${groupId}/tasks`).expect(403).expect({ code: 'FORBIDDEN' });
    await outsider.post(`/api/groups/${groupId}/tasks`).send(taskInput()).expect(403);
    for (const request of [
      () => outsider.get(`/api/tasks/${task.id}`),
      () => outsider.patch(`/api/tasks/${task.id}?scope=one`).send(taskInput()),
      () => outsider.delete(`/api/tasks/${task.id}?scope=one`),
      () => outsider.post(`/api/tasks/${task.id}/complete`),
      () => outsider.delete(`/api/tasks/${task.id}/complete`),
      () => outsider.patch(`/api/tasks/${task.id}/assignee`).send({ assigneeId: anya.id }),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time, like a client
      const response = await request();
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'FORBIDDEN' });
    }
    expect(await t.db.$count(tasks)).toBe(before);
    await anya.agent.get(`/api/tasks/${UNKNOWN_ID}`).expect(404);
  });

  it('materialises a weekly series 4 weeks ahead, balanced between members (AC-02)', async () => {
    await bohdan.agent.post(`/api/groups/${groupId}/tasks`).send(taskInput()).expect(403).expect({
      code: 'ADMIN_ONLY',
    });

    const first = await create({ recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7] } });

    const all = await list();
    expect(first.status).toBe('planned');
    expect(all).toHaveLength(28);
    expect(all.filter((task) => task.assigneeId === anya.id)).toHaveLength(14);
    expect(all.filter((task) => task.assigneeId === bohdan.id)).toHaveLength(14);
  });

  it('completes, undoes within 24 hours and refuses to reassign a done task', async () => {
    const task = await create({ assigneeId: bohdan.id });

    await anya.agent
      .post(`/api/tasks/${task.id}/complete`)
      .expect(403)
      .expect({ code: 'NOT_ASSIGNEE' });
    await bohdan.agent.post(`/api/tasks/${task.id}/complete`).expect(200);
    await anya.agent
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: anya.id })
      .expect(409)
      .expect({ code: 'TASK_DONE' });

    t.clock.advance(DAY + 1000);
    await bohdan.agent
      .delete(`/api/tasks/${task.id}/complete`)
      .expect(409)
      .expect({ code: 'UNDO_EXPIRED' });
    const undone = await anya.agent.delete(`/api/tasks/${task.id}/complete`).expect(200);
    expect(undone.body).toMatchObject({ completedAt: null });
  });

  it('rebuilds a series from an edit and stops it on delete, keeping done instances', async () => {
    const first = await create({ recurrence: { type: 'daily' }, assigneeId: bohdan.id });
    await bohdan.agent.post(`/api/tasks/${first.id}/complete`).expect(200);

    const [, second] = await list();
    const { body: rebuilt } = await anya.agent
      .patch(`/api/tasks/${second?.id}?scope=series`)
      .send(taskInput({ title: 'Mop the floor', dueAt: inDays(2), recurrence: { type: 'daily' } }))
      .expect(200);
    const titles = new Set((await list()).map((task) => task.title));
    expect(titles).toEqual(new Set(['Take out the trash', 'Mop the floor']));

    await anya.agent.delete(`/api/tasks/${rebuilt.id}?scope=series`).expect(204);
    t.clock.advance(3 * DAY);
    await t.app.get(SeriesTopUp).topUp();
    expect((await list()).map((task) => task.id)).toEqual([first.id]);
  });

  it('moves the open tasks of a member who leaves (FR-15)', async () => {
    await create({ recurrence: { type: 'daily' }, assigneeId: bohdan.id });

    await bohdan.agent.post(`/api/groups/${groupId}/leave`).expect(204);

    const all = await list();
    expect(all.every((task) => task.assigneeId === anya.id)).toBe(true);
    const [series] = await t.db.select().from(taskSeries);
    expect(series?.assigneeId).toBeNull();
  });

  it('moves automatic tasks off an absence and keeps manual ones (FR-17)', async () => {
    await create({ recurrence: { type: 'daily' } });
    const manual = await create({ title: 'Manual', assigneeId: bohdan.id, dueAt: inDays(3) });
    const from = inDays(0).slice(0, 10);
    const to = inDays(40).slice(0, 10);

    await bohdan.agent.post(`/api/groups/${groupId}/absences`).send({ from, to }).expect(201);

    const bohdans = (await list()).filter((task) => task.assigneeId === bohdan.id);
    expect(bohdans.map((task) => task.id)).toEqual([manual.id]);
  });

  it("tops up series idempotently on the creator's local clock", async () => {
    await anya.agent.patch('/api/me').send({ timezone: 'America/New_York' }).expect(200);
    const local = new TZDate(t.clock.now().getTime() + DAY, 'America/New_York');
    local.setHours(20, 0, 0, 0);
    await create({ recurrence: { type: 'daily' }, dueAt: new Date(local.getTime()).toISOString() });
    const topUp = t.app.get(SeriesTopUp);

    t.clock.advance(2 * DAY);
    await expect(topUp.topUp()).resolves.toBe(2);
    await expect(topUp.topUp()).resolves.toBe(0);

    const rows = await t.db.select().from(tasks).where(eq(tasks.groupId, groupId));
    const hours = new Set(rows.map((row) => new TZDate(row.dueAt, 'America/New_York').getHours()));
    expect(hours).toEqual(new Set([20]));
  });
});
