import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Argon2PasswordHasher, PasswordHasher } from '../../src/auth/index.js';
import { GoogleCalendarGateway } from '../../src/calendar/gateways/google-calendar.gateway.js';
import { CalendarOAuth } from '../../src/calendar/oauth/calendar-oauth.js';
import { Clock, FixedClock } from '../../src/common/clock.js';
import { EventDispatcher } from '../../src/common/events/event-dispatcher.js';
import { ObjectStorage } from '../../src/common/storage/object-storage.js';
import { S3ObjectStorage } from '../../src/common/storage/s3-object-storage.js';
import type { EnvironmentVariables } from '../../src/config/env.validation.js';
import { DATABASE, type Database } from '../../src/db/database.js';
import { truncateAll } from '../../src/db/tables.js';
import { MailTransport } from '../../src/mail/mail-transport.js';
import { FakeCalendarOAuth, FakeGoogleCalendar } from './calendar.js';
import { RecordingMailTransport } from './mailbox.js';
import { FlakyObjectStorage } from './storage.js';

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
  storage: FlakyObjectStorage;
  google: FakeGoogleCalendar;
  oauth: FakeCalendarOAuth;
  /** Runs the after-commit listeners that are due, as the poller would */
  deliverEvents: () => Promise<number>;
  /** A cookie-keeping client, like one browser */
  agent: () => TestAgent;
  /** Empties every table, the mailbox and the fakes, and resets the clock; call in beforeEach */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** The whole app against the test database and storage, with a fixed clock and a recording mailbox */
export async function createTestApp(): Promise<TestApp> {
  const clock = new FixedClock(START);
  const mailbox = new RecordingMailTransport();
  const google = new FakeGoogleCalendar();
  const oauth = new FakeCalendarOAuth();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(MailTransport)
    .useValue(mailbox)
    .overrideProvider(PasswordHasher)
    .useValue(TEST_HASHER)
    .overrideProvider(GoogleCalendarGateway)
    .useValue(google)
    .overrideProvider(CalendarOAuth)
    .useValue(oauth)
    .overrideProvider(ObjectStorage)
    .useFactory({
      factory: (config: ConfigService<EnvironmentVariables, true>) =>
        new FlakyObjectStorage(new S3ObjectStorage(config)),
      inject: [ConfigService],
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const db = app.get<Database>(DATABASE);
  const dispatcher = app.get(EventDispatcher);
  const storage = app.get(ObjectStorage);
  if (!(storage instanceof FlakyObjectStorage)) throw new Error('ObjectStorage was not overridden');

  return {
    app,
    db,
    clock,
    mailbox,
    storage,
    google,
    oauth,
    deliverEvents: () => dispatcher.dispatchDue(),
    agent: () => request.agent(app.getHttpServer()),
    reset: async () => {
      await truncateAll(db);
      mailbox.clear();
      storage.clear();
      google.clear();
      oauth.clear();
      clock.set(START);
    },
    close: () => app.close(),
  };
}
