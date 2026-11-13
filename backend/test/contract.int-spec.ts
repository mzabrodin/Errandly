import type TestAgent from 'supertest/lib/agent.js';

import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('API contract (integration)', () => {
  let t: TestApp;
  let anya: TestAgent;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reset();
    const user = await createUser(t.db, { email: 'anya@errandly.test' });
    anya = await signIn(t, user.email);
  });

  afterAll(async () => {
    await t.close();
  });

  const validTask = {
    title: 'Wash the dishes',
    description: '',
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    difficulty: 2,
    recurrence: { type: 'weekly', weekdays: [1, 4] },
    assigneeId: null,
  };
  const groupId = '019a6f3e-0000-7000-8000-000000000001';

  it('reports every invalid field with its code', () => {
    return t
      .agent()
      .post('/api/auth/register')
      .send({ name: '  ', email: 'nope', password: 'short' })
      .expect(400)
      .expect({
        code: 'VALIDATION',
        fields: { name: 'required', email: 'invalid', password: 'weak' },
      });
  });

  it('rejects properties that are not in the contract', () => {
    return t
      .agent()
      .post('/api/auth/login')
      .send({ email: 'anya@errandly.test', password: 'Pass1234', admin: true })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { admin: 'unknown' } });
  });

  it('lets a valid request through to a stub handler', () => {
    return anya
      .post(`/api/groups/${groupId}/tasks`)
      .send(validTask)
      .expect(501)
      .expect({ code: 'NOT_IMPLEMENTED' });
  });

  it('validates the recurrence variant', () => {
    return anya
      .post(`/api/groups/${groupId}/tasks`)
      .send({ ...validTask, recurrence: { type: 'weekly', weekdays: [] } })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { recurrence: 'noWeekdays' } });
  });

  it('rejects an unknown recurrence type and a task in the past', () => {
    return anya
      .post(`/api/groups/${groupId}/tasks`)
      .send({ ...validTask, dueAt: '2020-01-01T10:00:00.000Z', recurrence: { type: 'yearly' } })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { dueAt: 'inPast', recurrence: 'invalid' } });
  });

  it('answers 404 NOT_FOUND for a malformed id and an unknown route', async () => {
    await anya.get('/api/tasks/not-a-uuid').expect(404).expect({ code: 'NOT_FOUND' });
    await anya.get('/api/nope').expect(404).expect({ code: 'NOT_FOUND' });
  });

  it('checks absence ranges', () => {
    return anya
      .post(`/api/groups/${groupId}/absences`)
      .send({ from: '2026-11-10', to: '2026-11-09' })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { to: 'beforeFrom' } });
  });
});
