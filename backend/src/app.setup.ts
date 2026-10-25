import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';

import { NodeEnv, type EnvironmentVariables } from './config/env.validation.js';
import { API_PREFIX } from './config/urls.js';

export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: config.get('APP_URL', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) === NodeEnv.Development) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => createOpenApiDocument(app));
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder().setTitle('Errandly API').setVersion('0.1.0').build();
  return SwaggerModule.createDocument(app, config);
}
