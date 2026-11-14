import { sql } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';

import { eventIdFor } from '../src/calendar/calendar.rules.js';
import { calendarConnections, calendarEventLinks } from '../src/calendar/calendar.schema.js';
import { notificationPreferences } from '../src/notifications/notifications.schema.js';
import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface Person {
  id: string;
  agent: TestAgent;
}

interface TaskBody {
  id: string;
  seriesId: string;
}

describe('Calendar sync (integration)', () => {
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
    groupId = await groupOf(anya, bohdan);
  });

  afterAll(async () => {
    await t.close();
  });

  async function person(name: string): Promise<Person> {
    const user = await createUser(t.db, { name });
    return { id: user.id, agent: await signIn(t, user.email) };
  }

  async function groupOf(admin: Person, ...members: Person[]): Promise<string> {
    const id = (await admin.agent.post('/api/groups').send({ name: 'Room 12' }).expect(201)).body
      .id;
    for (const member of members) {
      // oxlint-disable-next-line no-await-in-loop -- one invite at a time, like the admin would
      const invite = await admin.agent.post(`/api/groups/${id}/invites`).send({}).expect(201);
      const token = new URL(invite.body.url).pathname.split('/').at(-1) ?? '';
      // oxlint-disable-next-line no-await-in-loop -- see above
      await member.agent.post(`/api/invites/${token}/accept`).expect(200);
    }
    return id;
  }

  async function connect(who: Person, account: string, as: Person = who): Promise<string> {
    const { body } = await as.agent.post('/api/me/calendar/connect').expect(200);
    const state = new URL(body.url).searchParams.get('state') ?? '';
    const response = await who.agent
      .get('/api/me/calendar/callback')
      .query({ code: account, state })
      .expect(302);
    return response.headers['location'] ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 10; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each round may publish the next events
      if ((await t.deliverEvents()) === 0) return;
    }
    throw new Error('Events kept coming after 10 rounds');
  }

  // Every retry delay (30 s … 32 min) is due after an hour
  async function retry(): Promise<void> {
    t.clock.advance(HOUR);
    await t.deliverEvents();
  }

  function eventsOf(account: string) {
    return t.google.eventsOf(`rt-${account}`);
  }

  async function create(overrides: Record<string, unknown> = {}): Promise<TaskBody> {
    const { body } = await anya.agent
      .post(`/api/groups/${groupId}/tasks`)
      .send({
        title: 'Take out the trash',
        description: '',
        dueAt: new Date(t.clock.now().getTime() + DAY).toISOString(),
        difficulty: 2,
        recurrence: { type: 'once' },
        assigneeId: bohdan.id,
        ...overrides,
      })
      .expect(201);
    return body;
  }

  async function settingsOf(who: Person) {
    return (await who.agent.get('/api/me/settings').expect(200)).body;
  }

  it('connects, creates the Errandly calendar and fills it with upcoming tasks (FR-32, FR-33)', async () => {
    const task = await create();

    expect(await connect(bohdan, 'bohdan')).toBe(
      'http://localhost:5173/settings?calendar=connected',
    );
    await settle();

    const [calendar] = t.google.calendars.values();
    expect(calendar?.name).toBe('Errandly');
    expect(eventsOf('bohdan').get(eventIdFor(task.id))).toMatchObject({
      title: 'Take out the trash',
      reminderMinutes: 60,
    });
    const settings = await settingsOf(bohdan);
    expect(settings.calendar).toMatchObject({
      connected: true,
      syncStatus: 'ok',
      googleEmail: 'bohdan@gmail.com',
    });
    expect(settings.calendar.lastSyncedAt).not.toBeNull();
    const [row] = await t.db.select().from(calendarConnections);
    expect(row?.refreshTokenEncrypted).not.toContain('rt-bohdan');
  });

  it("refuses another user's state and a declined consent", async () => {
    expect(await connect(bohdan, 'bohdan', anya)).toBe(
      'http://localhost:5173/settings?calendar=error',
    );
    const declined = await bohdan.agent
      .get('/api/me/calendar/callback')
      .query({ error: 'access_denied' })
      .expect(302);

    expect(declined.headers['location']).toBe('http://localhost:5173/settings?calendar=error');
    expect(await t.db.$count(calendarConnections)).toBe(0);
    expect((await settingsOf(bohdan)).calendar).toEqual({
      connected: false,
      syncStatus: 'ok',
      googleEmail: null,
      lastSyncedAt: null,
    });
  });

  it('keeps the change when Google is down and pauses after 5 attempts (BDD 2, FR-35)', async () => {
    await connect(bohdan, 'bohdan');
    await settle();
    t.google.failNext(5);

    const task = await create();
    await t.deliverEvents();
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one retry after another
      await retry();
    }

    await bohdan.agent.get(`/api/tasks/${task.id}`).expect(200);
    expect((await settingsOf(bohdan)).calendar.syncStatus).toBe('paused');
    expect(eventsOf('bohdan').size).toBe(0);

    const status = await bohdan.agent.post('/api/me/calendar/sync').expect(200);
    expect(status.body.syncStatus).toBe('ok');
    await settle();
    expect([...eventsOf('bohdan').keys()]).toEqual([eventIdFor(task.id)]);
  });

  it('retries a failed sync into exactly one event (AC-03)', async () => {
    await connect(bohdan, 'bohdan');
    await settle();
    t.google.failNext(1);

    const task = await create();
    await t.deliverEvents();
    expect(eventsOf('bohdan').size).toBe(0);
    await retry();
    await settle();

    expect([...eventsOf('bohdan').keys()]).toEqual([eventIdFor(task.id)]);
    expect((await settingsOf(bohdan)).calendar.syncStatus).toBe('ok');
  });

  it('pauses at once when the user revoked access', async () => {
    await connect(bohdan, 'bohdan');
    await settle();
    t.google.revoke('rt-bohdan');

    await create();
    await settle();

    expect((await settingsOf(bohdan)).calendar.syncStatus).toBe('paused');
  });

  it('moves the event to the new assignee and updates it on edits (FR-34)', async () => {
    await connect(anya, 'anya');
    await connect(bohdan, 'bohdan');
    const task = await create();
    await settle();

    await anya.agent
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: anya.id })
      .expect(200);
    await settle();

    expect(eventsOf('bohdan').size).toBe(0);
    expect(eventsOf('anya').has(eventIdFor(task.id))).toBe(true);

    await anya.agent.post(`/api/tasks/${task.id}/complete`).expect(200);
    await settle();
    expect(eventsOf('anya').get(eventIdFor(task.id))).toMatchObject({
      title: '✓ Take out the trash',
      reminderMinutes: null,
    });
  });

  it('removes the events on every kind of delete', async () => {
    await connect(bohdan, 'bohdan');
    const one = await create();
    const series = await create({ recurrence: { type: 'daily' }, title: 'Dishes' });
    const edited = await create({ recurrence: { type: 'daily' }, title: 'Floor' });
    await settle();
    const before = eventsOf('bohdan').size;

    await anya.agent.delete(`/api/tasks/${one.id}?scope=one`).expect(204);
    await anya.agent.delete(`/api/tasks/${series.id}?scope=series`).expect(204);
    await anya.agent
      .patch(`/api/tasks/${edited.id}?scope=series`)
      .send({
        title: 'Floor',
        description: '',
        dueAt: new Date(t.clock.now().getTime() + 2 * DAY).toISOString(),
        difficulty: 3,
        recurrence: { type: 'weekly', weekdays: [1] },
        assigneeId: bohdan.id,
      })
      .expect(200);
    await settle();

    expect(before).toBeGreaterThan(50);
    expect(eventsOf('bohdan').has(eventIdFor(one.id))).toBe(false);
    expect(eventsOf('bohdan').has(eventIdFor(series.id))).toBe(false);
    expect(eventsOf('bohdan').has(eventIdFor(edited.id))).toBe(false);
    const links = await t.db.select().from(calendarEventLinks);
    expect(eventsOf('bohdan').size).toBe(links.length);
  });

  it('removes the events of a group deleted when its last member leaves', async () => {
    await connect(bohdan, 'bohdan');
    const own = await groupOf(bohdan);
    const { body: task } = await bohdan.agent
      .post(`/api/groups/${own}/tasks`)
      .send({
        title: 'Water the plants',
        description: '',
        dueAt: new Date(t.clock.now().getTime() + DAY).toISOString(),
        difficulty: 1,
        recurrence: { type: 'once' },
        assigneeId: bohdan.id,
      })
      .expect(201);
    // Done tasks are not reassigned, so only the group deletion removes this event
    await bohdan.agent.post(`/api/tasks/${task.id}/complete`).expect(200);
    await settle();
    expect(eventsOf('bohdan').has(eventIdFor(task.id))).toBe(true);

    await bohdan.agent.post(`/api/groups/${own}/leave`).expect(204);
    await settle();

    expect(eventsOf('bohdan').has(eventIdFor(task.id))).toBe(false);
  });

  it('removes the event of a task deleted while its sync is still running', async () => {
    await connect(bohdan, 'bohdan');
    await settle();
    const hold = t.google.holdNextUpsert();
    const task = await create();

    const delivering = t.deliverEvents();
    await hold.started;
    const deleting = anya.agent.delete(`/api/tasks/${task.id}?scope=one`).then((r) => r);
    await waitForLockWait();
    hold.release();
    await delivering;
    expect((await deleting).status).toBe(204);
    await settle();

    expect(eventsOf('bohdan').size).toBe(0);
    expect(await t.db.$count(calendarEventLinks)).toBe(0);
  });

  async function waitForLockWait(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling the database
      const { rows } = await t.db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock'`,
      );
      if ((rows[0]?.waiting ?? 0) > 0) return;
      // oxlint-disable-next-line no-await-in-loop -- see above
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The delete never waited for the sync');
  }

  it('a resync removes events nothing links to any more', async () => {
    await connect(bohdan, 'bohdan');
    const task = await create();
    await settle();
    eventsOf('bohdan').set('leftover', {
      title: 'Gone',
      description: '',
      start: new Date(),
      end: new Date(),
      timeZone: 'UTC',
      reminderMinutes: null,
      url: '',
    });

    await bohdan.agent.post('/api/me/calendar/sync').expect(200);
    await settle();

    expect([...eventsOf('bohdan').keys()]).toEqual([eventIdFor(task.id)]);
  });

  it('disconnecting deletes the tokens and the calendar; later changes call nobody (SYS-18)', async () => {
    await connect(bohdan, 'bohdan');
    await create();
    await settle();

    const { body } = await bohdan.agent.delete('/api/me/calendar').expect(200);
    expect(body.connected).toBe(false);
    expect(await t.db.$count(calendarConnections)).toBe(0);
    await settle();

    expect(t.google.calendars.size).toBe(0);
    expect(t.oauth.revokedTokens).toEqual(['rt-bohdan']);
    t.google.calls = 0;
    await create();
    await settle();
    expect(t.google.calls).toBe(0);
    await bohdan.agent
      .post('/api/me/calendar/sync')
      .expect(409)
      .expect({ code: 'CALENDAR_NOT_CONNECTED' });
  });

  it('deleting the account removes the Errandly calendar too (NFR-LEG-02)', async () => {
    await connect(bohdan, 'bohdan');
    await settle();

    await bohdan.agent.delete('/api/me').expect(204);
    await settle();

    expect(t.google.calendars.size).toBe(0);
    expect(t.oauth.revokedTokens).toEqual(['rt-bohdan']);
  });

  it('reconnecting with another Google account replaces the calendar', async () => {
    await connect(bohdan, 'bohdan');
    const task = await create();
    await settle();

    await connect(bohdan, 'bohdan-work');
    await settle();

    expect(t.google.calendarIdOf('rt-bohdan')).toBeUndefined();
    expect(eventsOf('bohdan-work').has(eventIdFor(task.id))).toBe(true);
    expect((await settingsOf(bohdan)).calendar.googleEmail).toBe('bohdan-work@gmail.com');
  });

  it('keeps the calendar reminder across reconnects and re-syncs events when it changes', async () => {
    await bohdan.agent.patch('/api/me/settings').send({ calendarReminderMinutes: 15 }).expect(200);
    await connect(bohdan, 'bohdan');
    const task = await create();
    await settle();
    expect(eventsOf('bohdan').get(eventIdFor(task.id))?.reminderMinutes).toBe(15);

    await bohdan.agent.patch('/api/me/settings').send({ calendarReminderMinutes: 180 }).expect(200);
    await settle();
    expect(eventsOf('bohdan').get(eventIdFor(task.id))?.reminderMinutes).toBe(180);

    await bohdan.agent.delete('/api/me/calendar').expect(200);
    expect((await settingsOf(bohdan)).calendarReminderMinutes).toBe(180);
  });

  it('stores the email reminder and only the switches that differ from the defaults', async () => {
    const defaults = await settingsOf(anya);
    expect(defaults).toMatchObject({
      calendarReminderMinutes: 60,
      emailReminderMinutes: 1440,
      notifications: { assigned: true, dueSoon: true, overdue: true, weeklyDigest: false },
    });

    const { body } = await anya.agent
      .patch('/api/me/settings')
      .send({ notifications: { assigned: false, weeklyDigest: true } })
      .expect(200);
    expect(body.notifications).toEqual({
      assigned: false,
      dueSoon: true,
      overdue: true,
      weeklyDigest: true,
    });
    expect(await t.db.$count(notificationPreferences)).toBe(2);

    await anya.agent
      .patch('/api/me/settings')
      .send({ notifications: { assigned: true, weeklyDigest: false } })
      .expect(200);
    expect(await t.db.$count(notificationPreferences)).toBe(0);
    const { body: email } = await anya.agent
      .patch('/api/me/settings')
      .send({ emailReminderMinutes: 180 })
      .expect(200);
    expect(email).toMatchObject({ emailReminderMinutes: 180, calendarReminderMinutes: 60 });
    await anya.agent.patch('/api/me/settings').send({ emailReminderMinutes: 45 }).expect(400);
  });
});
