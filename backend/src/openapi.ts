import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp, createOpenApiDocument } from './app.setup.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
configureApp(app);

const document = createOpenApiDocument(app);
await writeFile(
  new URL('../openapi.json', import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
await app.close();
