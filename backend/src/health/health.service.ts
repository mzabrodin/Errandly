import { Injectable, Logger } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { EventPublicationStore } from '../common/events/event-publication.store.js';
import { ObjectStorage } from '../common/storage/object-storage.js';
import { addMs, MINUTE_MS, SECOND_MS } from '../common/time.js';
import { DatabaseHealth } from '../db/database-health.js';
import { MailHealth } from '../mail/index.js';
import {
  overallStatus,
  type ComponentStatus,
  type HealthComponents,
  type HealthStatus,
} from './health.rules.js';

/** Load balancers poll often; SMTP and S3 are asked at most this often */
const CACHE_MS = 30 * SECOND_MS;
const PROBE_TIMEOUT_MS = 3 * SECOND_MS;
/** Longer than the dispatcher's lease, so a delivery cut off by a restart is not counted */
const EVENTS_OVERDUE_MS = 10 * MINUTE_MS;

export interface HealthReport {
  status: HealthStatus;
  components: HealthComponents;
}

type External = Omit<HealthComponents, 'database'>;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private cached: { until: number; result: Promise<External> } | null = null;

  constructor(
    private readonly database: DatabaseHealth,
    private readonly storage: ObjectStorage,
    private readonly mail: MailHealth,
    private readonly events: EventPublicationStore,
    private readonly clock: Clock,
  ) {}

  /** Readiness: the database on every call, the rest from a short cache */
  async check(): Promise<HealthReport> {
    const [database, external] = await Promise.all([this.databaseStatus(), this.external()]);
    const components = { database, ...external };
    const status = overallStatus(components);
    if (status !== 'up') {
      const down = Object.entries(components).filter(([, value]) => value === 'down');
      this.logger.warn(`Health is ${status}: ${down.map(([name]) => name).join(', ')} down`);
    }
    return { status, components };
  }

  private async databaseStatus(): Promise<ComponentStatus> {
    return toStatus(await this.database.isUp());
  }

  private external(): Promise<External> {
    const now = this.clock.now().getTime();
    if (this.cached && now < this.cached.until) return this.cached.result;
    const result = this.probeExternal();
    this.cached = { until: now + CACHE_MS, result };
    return result;
  }

  private async probeExternal(): Promise<External> {
    const [storage, mail, events] = await Promise.all([
      probe(this.storage.ping().then(() => true)),
      probe(this.mail.isUp()),
      probe(this.eventsFlowing()),
    ]);
    return { storage, mail, events };
  }

  private async eventsFlowing(): Promise<boolean> {
    const overdue = await this.events.countOverdue(addMs(this.clock.now(), -EVENTS_OVERDUE_MS));
    return overdue === 0;
  }
}

function toStatus(up: boolean): ComponentStatus {
  return up ? 'up' : 'down';
}

/** A probe that fails or hangs counts as down */
async function probe(check: Promise<boolean>): Promise<ComponentStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
  });
  try {
    return toStatus(await Promise.race([check, timeout]));
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
