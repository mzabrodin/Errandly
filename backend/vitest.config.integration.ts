import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.int-spec.ts'],
    // One PostgreSQL 18 per run (Testcontainers, or INTEGRATION_DATABASE_URL), migrated from zero
    globalSetup: ['./test/setup/global-setup.ts'],
    setupFiles: ['reflect-metadata', './test/setup/env.ts'],
    env: {
      NODE_ENV: 'test',
      // Tests drive EventDispatcher.dispatchDue() themselves instead of racing the poller
      EVENTS_POLL_INTERVAL_MS: '0',
      // Every test signs in from the same address; rate-limits.int-spec.ts lowers them again
      RATE_LIMIT_PER_MINUTE: '100000',
      AUTH_RATE_LIMIT_PER_MINUTE: '100000',
    },
    // Tests share one database, so files run one after another
    fileParallelism: false,
    // Starting the container can take a while on the first run (image pull)
    hookTimeout: 120_000,
  },
});
