import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';

import { AppModule } from './../src/app.module.js';
import { EventBus } from './../src/common/events/event-bus.js';
import { EventDispatcher } from './../src/common/events/event-dispatcher.js';
import { eventPublications } from './../src/common/events/event-publications.schema.js';
import { DATABASE, type Database } from './../src/db/database.js';

describe('Events (integration)', () => {
  let app: INestApplication;
  let db: Database;
  let bus: EventBus;
  let dispatcher: EventDispatcher;
  const suffix = randomUUID().slice(0, 8);
  const delivered = `test.delivered.${suffix}`;
  const failing = `test.failing.${suffix}`;
  const received: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    db = app.get<Database>(DATABASE);
    bus = app.get(EventBus);
    dispatcher = app.get(EventDispatcher);
    bus.onAfterCommit('task.changed', delivered, (event) => {
      received.push(event.taskId);
      return Promise.resolve();
    });
    bus.onAfterCommit('task.changed', failing, () => Promise.reject(new Error('calendar down')));
  });

  afterAll(async () => {
    await db
      .delete(eventPublications)
      .where(inArray(eventPublications.listener, [delivered, failing]));
    await app.close();
  });

  const rowsOf = (listener: string) =>
    db.query.eventPublications.findMany({
      where: (table, { eq }) => eq(table.listener, listener),
    });

  it('stores nothing when the transaction rolls back', async () => {
    await expect(
      db.transaction(async (tx) => {
        await bus.publish(tx, 'task.changed', { taskId: 'rolled-back', groupId: 'g' });
        throw new Error('the business change failed');
      }),
    ).rejects.toThrow('the business change failed');

    expect(await rowsOf(delivered)).toEqual([]);
  });

  it('delivers committed events after commit and retries failing listeners', async () => {
    await db.transaction((tx) => bus.publish(tx, 'task.changed', { taskId: 't1', groupId: 'g' }));

    await dispatcher.dispatchDue();

    expect(received).toEqual(['t1']);
    const [done] = await rowsOf(delivered);
    expect(done?.completedAt).toBeInstanceOf(Date);

    const [retry] = await rowsOf(failing);
    expect(retry).toMatchObject({ attempts: 1, completedAt: null, lastError: 'calendar down' });
    expect(retry?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
  });
});
