import { setupWorker } from 'msw/browser';

import { resetDb } from './db';
import { handlers } from './handlers';
import { sendDigest, sendReminders } from './mailer';

export async function startMocks(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  Object.assign(window, {
    errandlyResetMocks: resetDb,
    errandlySendReminders: sendReminders,
    errandlySendDigest: sendDigest,
  });
  // oxlint-disable-next-line no-console -- tells the developer the mock API is running
  console.info(
    '[mock] Mock API is on. Demo sign-in: anya@errandly.dev / Pass1234. Reset data: errandlyResetMocks()',
  );
}
