import { Controller, Get, Query } from '@nestjs/common';
import { ApiFoundResponse, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../common/http/api-docs.js';
import { Public } from '../common/http/auth.js';
import { notImplemented } from '../common/http/stubs.js';
import { GoogleAuthQueryDto } from './dto/auth.dto.js';

/** Sign-in with Google (FR-07); comes with the Google OAuth credentials of the calendar work */
@ApiTags('auth')
@ApiErrorResponses()
@Controller('auth')
export class GoogleAuthController {
  /** Redirects to Google sign-in, then back to `next`. A separate flow from the calendar connection. */
  @Get('google')
  @Public()
  @ApiFoundResponse({ description: 'Redirect to Google' })
  google(@Query() query: GoogleAuthQueryDto): Promise<void> {
    return notImplemented(query);
  }
}
