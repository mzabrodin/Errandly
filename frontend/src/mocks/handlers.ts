import { delay, http } from 'msw';

import { activityHandlers } from './routes/activity';
import { authHandlers } from './routes/auth';
import { API } from './routes/common';
import { groupHandlers } from './routes/groups';
import { meHandlers } from './routes/me';
import { swapHandlers } from './routes/swaps';
import { taskHandlers } from './routes/tasks';

// Mock API handlers, grouped by section in ./routes
export const handlers = [
  http.all(`${API}/*`, async () => {
    await delay(250);
  }),
  ...authHandlers,
  ...groupHandlers,
  ...taskHandlers,
  ...swapHandlers,
  ...activityHandlers,
  ...meHandlers,
];
