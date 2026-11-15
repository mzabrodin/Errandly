import { ApiEnum } from '../../common/http/api-docs.js';
import {
  COMPONENT_STATUSES,
  HEALTH_STATUSES,
  type ComponentStatus,
  type HealthStatus,
} from '../health.rules.js';

/** Only `database` being down makes the whole check 503 */
export class HealthComponentsDto {
  @ApiEnum(COMPONENT_STATUSES, 'ComponentStatus')
  readonly database!: ComponentStatus;

  /** Object storage (avatars) */
  @ApiEnum(COMPONENT_STATUSES, 'ComponentStatus')
  readonly storage!: ComponentStatus;

  /** SMTP server */
  @ApiEnum(COMPONENT_STATUSES, 'ComponentStatus')
  readonly mail!: ComponentStatus;

  /** After-commit deliveries (emails, calendar sync) are not stuck */
  @ApiEnum(COMPONENT_STATUSES, 'ComponentStatus')
  readonly events!: ComponentStatus;
}

export class HealthResponseDto {
  /** `degraded`: something besides the database is down; the app still serves requests */
  @ApiEnum(HEALTH_STATUSES, 'HealthStatus')
  readonly status!: HealthStatus;

  readonly components!: HealthComponentsDto;
}

export class LivenessDto {
  @ApiEnum(['up'], 'LivenessStatus')
  readonly status!: 'up';
}
