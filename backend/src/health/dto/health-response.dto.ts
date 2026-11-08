import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  readonly status!: 'ok' | 'error';

  @ApiProperty({ enum: ['up', 'down'] })
  readonly database!: 'up' | 'down';
}
