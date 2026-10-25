import { setupWorker } from 'msw/browser';

import { resetDb } from './db';
import { handlers } from './handlers';
import { sendReminders } from './mailer';

export async function startMocks(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  Object.assign(window, {
    errandlyResetMocks: resetDb,
    errandlySendReminders: sendReminders,
  });
  // oxlint-disable-next-line no-console -- підказка розробнику, що працює мок-API
  console.info(
    '[mock] Мок-API увімкнено. Демо-вхід: anya@errandly.dev / Pass1234. Скинути дані: errandlyResetMocks()',
  );
}
