import { Logger } from '@nestjs/common';
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger';

/**
 * Writes every SQL statement at debug level (LOG_LEVEL=debug in development).
 * Parameters are left out on purpose: they carry password hashes and token hashes.
 */
export class QueryLogger implements DrizzleLogger {
  private readonly logger = new Logger('Database');

  logQuery(query: string, params: unknown[]): void {
    this.logger.debug(`${query} [${params.length} params]`);
  }
}
