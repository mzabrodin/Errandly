import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { configureApp, createOpenApiDocument } from './app.setup.js';

const app = await NestFactory.create(AppModule, { logger: false });
configureApp(app);

const document = createOpenApiDocument(app);
await writeFile(
  new URL('../openapi.json', import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
await app.close();
