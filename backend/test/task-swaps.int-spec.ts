import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';

import { tasks, taskSwaps } from '../src/tasks/tasks.schema.js';
import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const DAY = 24 * 60 * 60 * 1000;

function eventId(taskId: string): string {
  return taskId.replaceAll('-', '');
}

interface Person {
  id: string;
  agent: TestAgent;
}

describe('Task swaps (integration)', () => {
  let t: TestApp;
  let anya: Person;
  let bohdan: Person;
  let olena: Person;
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
    olena = await person('Олена');
    groupId = (await anya.agent.post('/api/groups').send({ name: 'Room 12' }).expect(201)).body.id;
    for (const member of [bohdan, olena]) {
      // oxlint-disable-next-line no-await-in-loop -- one invite at a time, like the admin would
      const invite = await anya.agent.post(`/api/groups/${groupId}/invites`).send({}).expect(201);
      const token = new URL(invite.body.url).pathname.split('/').at(-1) ?? '';
      // oxlint-disable-next-line no-await-in-loop -- see above
      await member.agent.post(`/api/invites/${token}/accept`).expect(200);
    }
  });

  afterAll(async () => {
    await t.close();
  });

  async function person(name: string): Promise<Person> {
    const user = await createUser(t.db, { name });
    return { id: user.id, agent: await signIn(t, user.email) };
  }

  async function taskOf(owner: Person, days: number): Promise<string> {
    const { body } = await anya.agent
      .post(`/api/groups/${groupId}/tasks`)
      .send({
        title: `Task of ${owner.id}`,
        description: '',
        dueAt: new Date(t.clock.now().getTime() + days * DAY).toISOString(),
        difficulty: 2,
        recurrence: { type: 'once' },
        assigneeId: owner.id,
      })
      .expect(201);
    return body.id;
  }

  async function propose(from: Person, offered: string, requested: string): Promise<string> {
    const { body } = await from.agent
      .post(`/api/tasks/${offered}/swaps`)
      .send({ requestedTaskId: requested })
      .expect(201);
    return body.id;
  }

  async function assigneeOf(taskId: string): Promise<string | null | undefined> {
    const [row] = await t.db.select().from(tasks).where(eq(tasks.id, taskId));
    return row?.assigneeId;
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 10; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each round may publish the next events
      if ((await t.deliverEvents()) === 0) return;
    }
    throw new Error('Events kept coming after 10 rounds');
  }

  it('swaps both assignees when the recipient accepts (FR-26)', async () => {
    const mine = await taskOf(anya, 1);
    const his = await taskOf(bohdan, 2);
    const swapId = await propose(anya, mine, his);

    const listed = await bohdan.agent.get(`/api/groups/${groupId}/swaps`).expect(200);
    expect(listed.body).toEqual([
      expect.objectContaining({
        id: swapId,
        status: 'pending',
        proposerId: anya.id,
        recipientId: bohdan.id,
        offeredTask: expect.objectContaining({ id: mine }),
        requestedTask: expect.objectContaining({ id: his }),
      }),
    ]);
    await olena.agent.get(`/api/groups/${groupId}/swaps`).expect(200).expect([]);
    await anya.agent.post(`/api/swaps/${swapId}/accept`).expect(403).expect({ code: 'FORBIDDEN' });

    await bohdan.agent.post(`/api/swaps/${swapId}/accept`).expect(200);

    expect(await assigneeOf(mine)).toBe(bohdan.id);
    expect(await assigneeOf(his)).toBe(anya.id);
    const task = await anya.agent.get(`/api/tasks/${his}`).expect(200);
    expect(task.body.manuallyAssigned).toBe(true);
    await anya.agent.get(`/api/groups/${groupId}/swaps`).expect(200).expect([]);
  });

  it('changes nothing when the recipient declines', async () => {
    const mine = await taskOf(anya, 1);
    const his = await taskOf(bohdan, 2);
    const swapId = await propose(anya, mine, his);

    const { body } = await bohdan.agent.post(`/api/swaps/${swapId}/decline`).expect(200);

    expect(body.status).toBe('declined');
    expect(await assigneeOf(mine)).toBe(anya.id);
    await bohdan.agent
      .post(`/api/swaps/${swapId}/accept`)
      .expect(409)
      .expect({ code: 'SWAP_STALE' });
  });

  it('drops a proposal whose task an admin gave to someone else', async () => {
    const mine = await taskOf(anya, 1);
    const his = await taskOf(bohdan, 2);
    const swapId = await propose(anya, mine, his);

    await anya.agent.patch(`/api/tasks/${his}/assignee`).send({ assigneeId: olena.id }).expect(200);

    await bohdan.agent.get(`/api/groups/${groupId}/swaps`).expect(200).expect([]);
    await bohdan.agent
      .post(`/api/swaps/${swapId}/accept`)
      .expect(409)
      .expect({ code: 'SWAP_STALE' });
    expect(await assigneeOf(mine)).toBe(anya.id);
  });

  it('lets only one of two concurrent swaps of the same task through (SYS-13)', async () => {
    const mine = await taskOf(anya, 1);
    const hers = await taskOf(olena, 3);
    const his = await taskOf(bohdan, 2);
    const fromAnya = await propose(anya, mine, his);
    const fromOlena = await propose(olena, hers, his);

    const responses = await Promise.all([
      bohdan.agent.post(`/api/swaps/${fromAnya}/accept`),
      bohdan.agent.post(`/api/swaps/${fromOlena}/accept`),
    ]);

    expect(responses.map(({ status }) => status).toSorted((a, b) => a - b)).toEqual([200, 409]);
    const winner = responses[0].status === 200 ? anya : olena;
    expect(await assigneeOf(his)).toBe(winner.id);
    expect(await assigneeOf(winner === anya ? mine : hers)).toBe(bohdan.id);
    expect(await assigneeOf(winner === anya ? hers : mine)).toBe(
      winner === anya ? olena.id : anya.id,
    );
  });

  it('removes the swaps of a deleted task', async () => {
    const mine = await taskOf(anya, 1);
    const his = await taskOf(bohdan, 2);
    await propose(anya, mine, his);

    await anya.agent.delete(`/api/tasks/${mine}?scope=one`).expect(204);

    expect(await t.db.$count(taskSwaps)).toBe(0);
  });

  it('moves both calendar events when a swap is accepted (FR-34)', async () => {
    for (const [who, account] of [
      [anya, 'anya'],
      [bohdan, 'bohdan'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one OAuth round trip at a time
      const { body } = await who.agent.post('/api/me/calendar/connect').expect(200);
      const state = new URL(body.url).searchParams.get('state') ?? '';
      // oxlint-disable-next-line no-await-in-loop -- see above
      await who.agent.get('/api/me/calendar/callback').query({ code: account, state }).expect(302);
    }
    const mine = await taskOf(anya, 1);
    const his = await taskOf(bohdan, 2);
    await settle();
    expect([...t.google.eventsOf('rt-anya').keys()]).toEqual([eventId(mine)]);

    const swapId = await propose(anya, mine, his);
    await bohdan.agent.post(`/api/swaps/${swapId}/accept`).expect(200);
    await settle();

    expect([...t.google.eventsOf('rt-anya').keys()]).toEqual([eventId(his)]);
    expect([...t.google.eventsOf('rt-bohdan').keys()]).toEqual([eventId(mine)]);
  });
});
