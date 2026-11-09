import { Module } from '@nestjs/common';

import { MailModule } from '../mail/index.js';
import { UsersModule } from '../users/index.js';
import { AbsencesController } from './absences.controller.js';
import { AbsencesService } from './absences.service.js';
import { GroupsApi } from './groups.api.js';
import { GroupsController } from './groups.controller.js';
import { GroupsRepository } from './groups.repository.js';
import { GroupsService } from './groups.service.js';
import { InviteEmails } from './invite-emails.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';

@Module({
  imports: [UsersModule, MailModule],
  controllers: [GroupsController, InvitesController, AbsencesController],
  providers: [
    GroupsRepository,
    GroupsApi,
    GroupsService,
    InvitesService,
    InviteEmails,
    AbsencesService,
  ],
  exports: [GroupsApi],
})
export class GroupsModule {}
