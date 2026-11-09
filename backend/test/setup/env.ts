// Runs before each test file imports the app, so ConfigModule validates the test database URL
import { inject } from 'vitest';

process.env['DATABASE_URL'] = inject('databaseUrl');
