/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Node's Request needs an absolute URL
    env: { VITE_API_URL: 'http://localhost' },
    coverage: {
      provider: 'v8',
      // NFR-MAIN-02 sets 70% for business logic; components are covered by the e2e tests
      include: ['src/features/**/*.ts', 'src/shared/api/**/*.ts', 'src/shared/lib/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/shared/api/schema.d.ts',
        'src/shared/api/types.ts',
        // Canvas and page layout, which jsdom does not have; the e2e tests run them
        'src/shared/lib/image.ts',
        'src/features/settings/useActiveSection.ts',
      ],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
