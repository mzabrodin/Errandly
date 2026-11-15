import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { armShutdownDeadline } from './common/shutdown.js';
import { SECOND_MS } from './common/time.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);

  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const shutdownTimeout = config.get('SHUTDOWN_TIMEOUT_MS', { infer: true });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => armShutdownDeadline(shutdownTimeout, new Logger('Shutdown')));
  }

  const server = app.getHttpServer();
  // A slow or stalled client cannot hold a connection (and a shutdown) for long
  server.requestTimeout = 30 * SECOND_MS;
  server.headersTimeout = 15 * SECOND_MS;
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
