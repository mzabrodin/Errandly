import type { Response } from 'express';

import type { DatabaseHealth } from '../db/database-health.js';
import { HealthController } from './health.controller.js';

function setup(databaseUp: boolean) {
  const database = { isUp: vi.fn<() => Promise<boolean>>().mockResolvedValue(databaseUp) };
  const res = { status: vi.fn<(status: number) => void>() };
  const controller = new HealthController(database as unknown as DatabaseHealth);
  return { controller, res, check: () => controller.check(res as unknown as Response) };
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const { check, res } = setup(true);

    await expect(check()).resolves.toEqual({ status: 'ok', database: 'up' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 when the database is down', async () => {
    const { check, res } = setup(false);

    await expect(check()).resolves.toEqual({ status: 'error', database: 'down' });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
