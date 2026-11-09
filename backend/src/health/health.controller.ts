import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public } from '../common/http/auth.js';
import { DatabaseHealth } from '../db/database-health.js';
import { HealthResponseDto } from './dto/health-response.dto.js';

// Docker and CI poll it without a session, so it is neither guarded nor rate-limited
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealth) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto, description: 'The server and the database are up' })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto, description: 'The database is down' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponseDto> {
    if (await this.database.isUp()) {
      return { status: 'ok', database: 'up' };
    }
    res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: 'error', database: 'down' };
  }
}
