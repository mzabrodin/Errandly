import { Module } from '@nestjs/common';

import { AbsencesController } from './absences.controller.js';
import { GroupsController } from './groups.controller.js';
import { InvitesController } from './invites.controller.js';

@Module({
  controllers: [GroupsController, InvitesController, AbsencesController],
})
export class GroupsModule {}
