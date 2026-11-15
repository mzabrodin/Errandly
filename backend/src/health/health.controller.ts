import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public } from '../common/http/auth.js';
import { HealthResponseDto, LivenessDto } from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

// Docker, nginx and CI poll it without a session, so it is neither guarded nor rate-limited
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Readiness: 200 when up or degraded, 503 when the database is down. */
  @Get()
  @ApiOkResponse({ type: HealthResponseDto, description: 'Up, or degraded but serving' })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto, description: 'Not ready' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponseDto> {
    const report = await this.health.check();
    if (report.status === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }

  /** Liveness: the process answers; no dependency is asked. */
  @Get('live')
  live(): LivenessDto {
    return { status: 'up' };
  }
}
