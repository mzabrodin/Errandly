import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';

import { originCheck } from './common/http/origin-check.js';
import { SESSION_COOKIE } from './common/http/session-cookie.js';
import { validationExceptionFactory } from './common/validation/validation.js';
import { NodeEnv, type EnvironmentVariables } from './config/env.validation.js';
import { API_PREFIX } from './config/urls.js';

export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const appUrl = config.get('APP_URL', { infer: true });
  const isDevelopment = config.get('NODE_ENV', { infer: true }) === NodeEnv.Development;

  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  // nginx is the one proxy in front: client IPs (rate limits) come from X-Forwarded-For
  app.set('trust proxy', 1);
  // Swagger UI needs inline scripts, so its CSP is relaxed in development only
  app.use(helmet({ contentSecurityPolicy: !isDevelopment }));
  app.use(originCheck(appUrl));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.enableCors({ origin: appUrl, credentials: true });
  app.enableShutdownHooks();

  if (isDevelopment) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => createOpenApiDocument(app));
  }
}

export function createOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Errandly API')
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();
  return SwaggerModule.createDocument(app, config);
}
