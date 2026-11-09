import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Argon2PasswordHasher, PasswordHasher } from '../../src/auth/index.js';
import { Clock, FixedClock } from '../../src/common/clock.js';
import { EventDispatcher } from '../../src/common/events/event-dispatcher.js';
import { DATABASE, type Database } from '../../src/db/database.js';
import { truncateAll } from '../../src/db/tables.js';
import { MailTransport } from '../../src/mail/mail-transport.js';
import { RecordingMailTransport } from './mailbox.js';

/** Cheap enough for hundreds of hashes per run; production uses the OWASP parameters */
export const TEST_HASHER = new Argon2PasswordHasher({
  memoryCost: 1024,
  timeCost: 1,
  parallelism: 1,
});

export const START = new Date('2026-11-09T09:00:00.000Z');

export interface TestApp {
  app: NestExpressApplication;
  db: Database;
  clock: FixedClock;
  mailbox: RecordingMailTransport;
  /** Runs the after-commit listeners that are due, as the poller would */
  deliverEvents: () => Promise<number>;
  /** A cookie-keeping client, like one browser */
  agent: () => TestAgent;
  /** Empties every table and the mailbox and resets the clock; call in beforeEach */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** The whole app against the test database, with a fixed clock and a recording mailbox */
export async function createTestApp(): Promise<TestApp> {
  const clock = new FixedClock(START);
  const mailbox = new RecordingMailTransport();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(MailTransport)
    .useValue(mailbox)
    .overrideProvider(PasswordHasher)
    .useValue(TEST_HASHER)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const db = app.get<Database>(DATABASE);
  const dispatcher = app.get(EventDispatcher);

  return {
    app,
    db,
    clock,
    mailbox,
    deliverEvents: () => dispatcher.dispatchDue(),
    agent: () => request.agent(app.getHttpServer()),
    reset: async () => {
      await truncateAll(db);
      mailbox.clear();
      clock.set(START);
    },
    close: () => app.close(),
  };
}
