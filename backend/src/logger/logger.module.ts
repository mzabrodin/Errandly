import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule, type Params } from 'nestjs-pino';
import type { SerializedRequest } from 'pino';

import { errorCodeOf } from '../common/errors/api-exception.filter.js';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import { API_PREFIX } from '../config/urls.js';
import { redactUrl } from './redact-url.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';

const HEALTH_PATH = `/${API_PREFIX}/health`;

// Passwords and secrets must never reach the logs (NFR-SEC-01, SYS-23)
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

function createLoggerParams(config: ConfigService<EnvironmentVariables, true>): Params {
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  return {
    pinoHttp: {
      level: nodeEnv === NodeEnv.Test ? 'silent' : config.get('LOG_LEVEL', { infer: true }),
      ...(nodeEnv === NodeEnv.Development && {
        transport: { target: 'pino-pretty', options: { singleLine: true } },
      }),
      genReqId: (req, res) => {
        const id = resolveRequestId(req.headers);
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      serializers: {
        req: (req: SerializedRequest): SerializedRequest => ({
          ...req,
          url: redactUrl(req.url) ?? '',
        }),
      },
      // The contract error code (VALIDATION, LAST_ADMIN, ...) on the request-completed line
      customProps: (_req, res) => ({ errorCode: errorCodeOf(res) }),
      autoLogging: { ignore: (req) => req.url?.startsWith(HEALTH_PATH) ?? false },
      customLogLevel: (_req, res, error) => {
        if (error !== undefined || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createLoggerParams,
    }),
  ],
})
export class LoggerModule {}
