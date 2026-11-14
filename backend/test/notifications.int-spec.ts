import type TestAgent from 'supertest/lib/agent.js';

import { ReminderJobs } from '../src/notifications/reminder-jobs.js';
import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Person {
  id: string;
  email: string;
  agent: TestAgent;
}

interface NotificationBody {
  id: string;
  type: string;
  read: boolean;
  data: { taskTitle?: string; actorName?: string };
}

function kyivDay(at: Date): string {
  return at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
}

describe('Notifications (integration)', () => {
  let t: TestApp;
  let jobs: ReminderJobs;
  let anya: Person;
  let bohdan: Person;
  let olena: Person;
  let groupId: string;

  beforeAll(async () => {
    t = await createTestApp();
    jobs = t.app.get(ReminderJobs);
  });

  beforeEach(async () => {
    await t.reset();
    // IsFutureDate checks against the real time, so the app clock follows it here
    t.clock.set(new Date());
    anya = await person('Аня');
    bohdan = await person('Богдан');
    olena = await person('Олена');
    groupId = (await anya.agent.post('/api/groups').send({ name: 'Room 12' }).expect(201)).body.id;
    for (const member of [bohdan, olena]) {
      // oxlint-disable-next-line no-await-in-loop -- one invite at a time, like the admin would
      const invite = await anya.agent.post(`/api/groups/${groupId}/invites`).send({}).expect(201);
      const token = new URL(invite.body.url).pathname.split('/').at(-1) ?? '';
      // oxlint-disable-next-line no-await-in-loop -- see above
      await member.agent.post(`/api/invites/${token}/accept`).expect(200);
    }
    await t.deliverEvents();
    t.mailbox.clear();
  });

  afterAll(async () => {
    await t.close();
  });

  async function person(name: string): Promise<Person> {
    const user = await createUser(t.db, { name });
    return { id: user.id, email: user.email, agent: await signIn(t, user.email) };
  }

  async function createTask(overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
    const { body } = await anya.agent
      .post(`/api/groups/${groupId}/tasks`)
      .send({
        title: 'Take out the trash',
        description: '',
        dueAt: new Date(t.clock.now().getTime() + 2 * HOUR).toISOString(),
        difficulty: 2,
        recurrence: { type: 'once' },
        assigneeId: bohdan.id,
        ...overrides,
      })
      .expect(201);
    return body;
  }

  async function feedOf(who: Person): Promise<NotificationBody[]> {
    return (await who.agent.get('/api/notifications').expect(200)).body.items;
  }

  async function typesOf(who: Person): Promise<string[]> {
    return (await feedOf(who)).map(({ type }) => type);
  }

  function subjectsTo(who: Person): string[] {
    return t.mailbox.to(who.email).map(({ subject }) => subject);
  }

  it('tells the group about joins and the admin about nothing they did themselves', async () => {
    expect(await typesOf(anya)).toEqual(['memberJoined', 'memberJoined', 'groupCreated']);
    expect(await typesOf(bohdan)).toEqual(['groupJoined']);
  });

  it('announces only the first instance of a new series, with one email', async () => {
    await createTask({ recurrence: { type: 'daily' }, assigneeId: bohdan.id });
    await t.deliverEvents();

    expect((await typesOf(bohdan)).filter((type) => type === 'taskAssigned')).toHaveLength(1);
    expect(subjectsTo(bohdan)).toEqual(['Нова задача: Take out the trash']);
  });

  it('tells the new and the previous assignee about a manual reassignment', async () => {
    const task = await createTask();
    await anya.agent
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: olena.id })
      .expect(200);
    await t.deliverEvents();

    expect(await typesOf(olena)).toContain('taskAssigned');
    expect(await typesOf(bohdan)).toContain('taskUnassigned');
    expect((await feedOf(olena)).find(({ type }) => type === 'taskAssigned')?.data).toMatchObject({
      taskTitle: 'Take out the trash',
      actorName: 'Аня',
    });
    expect(t.mailbox.to(olena.email).at(-1)?.text).toContain('Аня доручає вам задачу');
  });

  it('marks the caller’s own notifications as read, and nobody else’s', async () => {
    const [first] = await feedOf(bohdan);
    await anya.agent
      .post('/api/notifications/read')
      .send({ ids: [first?.id] })
      .expect(204);
    expect((await feedOf(bohdan))[0]?.read).toBe(false);

    await bohdan.agent
      .post('/api/notifications/read')
      .send({ ids: [first?.id] })
      .expect(204);
    const after = await bohdan.agent.get('/api/notifications').expect(200);
    expect(after.body.unread).toBe(0);

    await anya.agent.post('/api/notifications/read').send({}).expect(204);
    expect((await anya.agent.get('/api/notifications').expect(200)).body.unread).toBe(0);
  });

  it('tells both sides of a task swap', async () => {
    const mine = await createTask({ assigneeId: anya.id });
    const his = await createTask({ assigneeId: bohdan.id });
    const swap = await anya.agent
      .post(`/api/tasks/${mine.id}/swaps`)
      .send({ requestedTaskId: his.id })
      .expect(201);
    await bohdan.agent.post(`/api/swaps/${swap.body.id}/decline`).expect(200);

    expect(await typesOf(bohdan)).toContain('swapProposed');
    expect(await typesOf(anya)).toContain('swapDeclined');
  });

  it('tells the other admins once when nobody can take a task (FR-29)', async () => {
    await anya.agent
      .patch(`/api/groups/${groupId}/members/${olena.id}`)
      .send({ role: 'admin' })
      .expect(204);
    const due = new Date(t.clock.now().getTime() + 3 * DAY);
    for (const who of [anya, bohdan, olena]) {
      // oxlint-disable-next-line no-await-in-loop -- one absence per member
      await who.agent
        .post(`/api/groups/${groupId}/absences`)
        .send({ from: kyivDay(due), to: kyivDay(due) })
        .expect(201);
    }

    await createTask({ dueAt: due.toISOString(), assigneeId: null });
    await createTask({ dueAt: due.toISOString(), assigneeId: null });

    const forOlena = (await typesOf(olena)).filter((type) => type === 'taskNoAssignee');
    expect(forOlena).toHaveLength(1);
    expect(await typesOf(anya)).not.toContain('taskNoAssignee');
  });

  it('sends the due-soon reminder once, and not at all when it is turned off', async () => {
    await createTask({ assigneeId: bohdan.id });
    await createTask({ assigneeId: olena.id });
    await olena.agent
      .patch('/api/me/settings')
      .send({ notifications: { dueSoon: false } })
      .expect(200);
    await t.deliverEvents();
    t.mailbox.clear();

    await jobs.run();
    await jobs.run();
    await t.deliverEvents();

    expect(subjectsTo(bohdan)).toEqual([
      expect.stringMatching(/^Нагадування: Take out the trash о /),
    ]);
    expect(subjectsTo(olena)).toEqual([]);
  });

  it('notifies about an overdue task once, in the bell and by email (FR-25)', async () => {
    await createTask({
      assigneeId: bohdan.id,
      dueAt: new Date(t.clock.now().getTime() + HOUR).toISOString(),
    });
    await t.deliverEvents();
    t.clock.advance(2 * HOUR);
    t.mailbox.clear();

    await jobs.run();
    await jobs.run();
    await t.deliverEvents();

    expect((await typesOf(bohdan)).filter((type) => type === 'taskOverdue')).toHaveLength(1);
    expect(subjectsTo(bohdan)).toEqual(['Прострочено: Take out the trash']);
  });

  it('sends the weekly digest on Monday morning, once', async () => {
    const now = t.clock.now();
    const monday = new Date(now.getTime() + 3 * DAY);
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
    monday.setUTCHours(8, 0, 0, 0);
    await createTask({
      assigneeId: bohdan.id,
      dueAt: new Date(monday.getTime() + DAY).toISOString(),
    });
    await createTask({
      assigneeId: bohdan.id,
      dueAt: new Date(monday.getTime() - 2 * DAY).toISOString(),
    });
    await bohdan.agent
      .patch('/api/me/settings')
      .send({ notifications: { weeklyDigest: true } })
      .expect(200);
    await t.deliverEvents();
    t.mailbox.clear();
    t.clock.set(monday);

    await jobs.digests();
    await jobs.digests();
    await t.deliverEvents();

    const digests = t.mailbox
      .to(bohdan.email)
      .filter(({ subject }) => subject.startsWith('Ваш тиждень'));
    expect(digests.map(({ subject }) => subject)).toEqual(['Ваш тиждень: 1 задача']);
    expect(digests[0]?.text).toContain('прострочено 1');
  });

  it('retries a reminder email after an SMTP outage', async () => {
    await createTask({ assigneeId: bohdan.id });
    await t.deliverEvents();
    t.mailbox.clear();
    t.mailbox.failNext(1);

    await jobs.run();
    await t.deliverEvents();
    expect(subjectsTo(bohdan)).toEqual([]);

    t.clock.advance(HOUR);
    await t.deliverEvents();
    expect(subjectsTo(bohdan)).toHaveLength(1);
  });
});
