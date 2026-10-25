import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('echoes the request id', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'e2e-123')
      .expect('x-request-id', 'e2e-123');
  });

  it('does not serve Swagger UI outside development', () => {
    return request(app.getHttpServer()).get('/api/docs').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
