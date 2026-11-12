import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/openapi.ts',
        'src/app.setup.ts',
        'src/**/*.module.ts',
        // CLI scripts, exercised by the CI migrate and seed steps
        'src/db/migrate.ts',
        'src/db/seed.ts',
        // Drizzle queries only; the e2e tests run them against PostgreSQL (test/**)
        'src/**/*.repository.ts',
        'src/**/*.store.ts',
        'src/db/tables.ts',
        // The S3 adapter; the e2e tests run it against SeaweedFS
        'src/common/storage/s3-object-storage.ts',
      ],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
