import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

// The stub controllers already enforce the request contract: validation answers in the
// frontend's error format, and valid requests reach the handler (501 until it is implemented)
describe('API contract (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: '  ', email: 'nope', password: 'short' })
      .expect(400)
      .expect({
        code: 'VALIDATION',
        fields: { name: 'required', email: 'invalid', password: 'weak' },
      });
  });

  it('rejects properties that are not in the contract', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'anya@errandly.dev', password: 'Pass1234', admin: true })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { admin: 'unknown' } });
  });

  it('lets a valid request through to the handler', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Anya', email: 'Anya@Errandly.dev', password: 'Pass1234', locale: 'en' })
      .expect(501)
      .expect({ code: 'NOT_IMPLEMENTED' });
  });

  it('validates the recurrence variant', () => {
    return request(app.getHttpServer())
      .post(`/api/groups/${groupId}/tasks`)
      .send({ ...validTask, recurrence: { type: 'weekly', weekdays: [] } })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { recurrence: 'noWeekdays' } });
  });

  it('rejects an unknown recurrence type and a task in the past', () => {
    return request(app.getHttpServer())
      .post(`/api/groups/${groupId}/tasks`)
      .send({ ...validTask, dueAt: '2020-01-01T10:00:00.000Z', recurrence: { type: 'yearly' } })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { dueAt: 'inPast', recurrence: 'invalid' } });
  });

  it('accepts a valid task', () => {
    return request(app.getHttpServer())
      .post(`/api/groups/${groupId}/tasks`)
      .send(validTask)
      .expect(501);
  });

  it('answers 404 NOT_FOUND for a malformed id and an unknown route', async () => {
    await request(app.getHttpServer()).get('/api/tasks/not-a-uuid').expect(404).expect({
      code: 'NOT_FOUND',
    });
    await request(app.getHttpServer()).get('/api/nope').expect(404).expect({ code: 'NOT_FOUND' });
  });

  it('checks absence ranges', () => {
    return request(app.getHttpServer())
      .post(`/api/groups/${groupId}/absences`)
      .send({ from: '2026-11-10', to: '2026-11-09' })
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { to: 'beforeFrom' } });
  });
});
