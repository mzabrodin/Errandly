import { Inject, Injectable } from '@nestjs/common';

import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database } from '../db/database.js';
import { GroupsApi } from './groups.api.js';
import { GroupsRepository } from './groups.repository.js';

/** A member's own absences (FR-15, FR-29): no tasks are assigned to them on those days */
@Injectable()
export class AbsencesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: GroupsRepository,
    private readonly access: GroupsApi,
    private readonly bus: EventBus,
  ) {}

  /** The tasks module reassigns the member's automatic tasks on those days, in this transaction */
  async add(groupId: string, userId: string, from: string, to: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.access.requireMember(groupId, userId, tx);
      await this.repository.insertAbsence({ groupId, userId, startsOn: from, endsOn: to }, tx);
      await this.bus.publish(tx, 'group.absenceAdded', { groupId, userId, from, to });
    });
  }

  /** Only one's own absence; someone else's or a missing one is 404 NOT_FOUND */
  async remove(groupId: string, userId: string, absenceId: string): Promise<void> {
    await this.access.requireMember(groupId, userId);
    if (!(await this.repository.deleteAbsence(absenceId, groupId, userId))) {
      throw new DomainError('NOT_FOUND');
    }
  }
}
