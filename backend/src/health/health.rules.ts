export const HEALTH_STATUSES = ['up', 'degraded', 'down'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const COMPONENT_STATUSES = ['up', 'down'] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export interface HealthComponents {
  /** Critical: without it the app cannot serve anything */
  database: ComponentStatus;
  storage: ComponentStatus;
  mail: ComponentStatus;
  /** Down when after-commit deliveries wait long past their time */
  events: ComponentStatus;
}

/** Only the database takes the app out of rotation; a mail outage must not */
export function overallStatus(components: HealthComponents): HealthStatus {
  if (components.database === 'down') return 'down';
  return Object.values(components).includes('down') ? 'degraded' : 'up';
}
