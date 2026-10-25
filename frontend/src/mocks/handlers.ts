import { delay, http } from 'msw';

import { activityHandlers } from './routes/activity';
import { authHandlers } from './routes/auth';
import { API } from './routes/common';
import { groupHandlers } from './routes/groups';
import { meHandlers } from './routes/me';
import { taskHandlers } from './routes/tasks';

// Обробники мок-API, згруповані за розділами в ./routes
export const handlers = [
  http.all(`${API}/*`, async () => {
    await delay(250);
  }),
  ...authHandlers,
  ...groupHandlers,
  ...taskHandlers,
  ...activityHandlers,
  ...meHandlers,
];
