import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    // Tests drive EventDispatcher.dispatchDue() themselves instead of racing the poller
    env: { EVENTS_POLL_INTERVAL_MS: '0' },
    // Tests share one database, so files run one after another
    fileParallelism: false,
  },
});
