import { Logger } from '@nestjs/common';
import type pg from 'pg';

import { DatabaseHealth } from './database-health.js';
import { createDatabase, createPool } from './database.js';
import { QueryLogger } from './query-logger.js';

describe('database', () => {
  it('creates a lazy pool and a Drizzle instance without connecting', async () => {
    const pool = createPool('postgresql://user:pass@127.0.0.1:1/none');
    expect(pool.totalCount).toBe(0);
    expect(createDatabase(pool)).toBeDefined();
    expect(createDatabase(pool, { logQueries: false })).toBeDefined();
    await pool.end();
  });

  it('logs SQL without its parameters', () => {
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    new QueryLogger().logQuery('select * from users where email = $1', ['anya@errandly.dev']);

    expect(debug).toHaveBeenCalledWith('select * from users where email = $1 [1 params]');
    debug.mockRestore();
  });

  describe('DatabaseHealth', () => {
    it('is up when the query succeeds', async () => {
      const pool = { query: vi.fn<() => Promise<unknown>>().mockResolvedValue({ rows: [] }) };
      await expect(new DatabaseHealth(pool as unknown as pg.Pool).isUp()).resolves.toBe(true);
    });

    it('is down and logs a warning when the query fails', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const pool = {
        query: vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      await expect(new DatabaseHealth(pool as unknown as pg.Pool).isUp()).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith('Database is unreachable: ECONNREFUSED');
      warn.mockRestore();
    });
  });
});
