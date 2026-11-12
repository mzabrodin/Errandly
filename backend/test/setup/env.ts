// Runs before each test file imports the app, so ConfigModule validates the test services
import { inject } from 'vitest';

process.env['DATABASE_URL'] = inject('databaseUrl');
process.env['S3_ENDPOINT'] = inject('storageEndpoint');
