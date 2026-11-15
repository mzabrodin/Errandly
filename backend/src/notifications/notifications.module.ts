import { Module, type OnModuleInit } from '@nestjs/common';

import { CalendarModule } from '../calendar/index.js';
import { DataRetention } from '../common/retention.js';
import { GroupsModule } from '../groups/index.js';
import { MailModule } from '../mail/index.js';
import { TasksModule } from '../tasks/index.js';
import { UsersModule } from '../users/index.js';
import { NotificationEmails } from './notification-emails.js';
import { NotificationFeed } from './notification-feed.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsRepository } from './notifications.repository.js';
import { purgeCutoffs } from './notifications.rules.js';
import { NotificationsService } from './notifications.service.js';
import { ReminderJobs } from './reminder-jobs.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [CalendarModule, GroupsModule, MailModule, TasksModule, UsersModule],
  controllers: [NotificationsController, SettingsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationFeed,
    NotificationEmails,
    ReminderJobs,
    SettingsService,
  ],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly retention: DataRetention,
    private readonly repository: NotificationsRepository,
  ) {}

  onModuleInit(): void {
    this.retention.register('notifications', (now) => this.repository.purge(purgeCutoffs(now)));
  }
}
