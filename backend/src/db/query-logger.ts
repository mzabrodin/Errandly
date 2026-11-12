import { Logger } from '@nestjs/common';
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger';

/** Parameters are left out on purpose: they carry password and token hashes */
export class QueryLogger implements DrizzleLogger {
  private readonly logger = new Logger('Database');

  logQuery(query: string, params: unknown[]): void {
    this.logger.debug(`${query} [${params.length} params]`);
  }
}
