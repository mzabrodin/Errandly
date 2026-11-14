import { Module } from '@nestjs/common';

import { CalendarModule } from '../calendar/index.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsRepository } from './notifications.repository.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [CalendarModule],
  controllers: [NotificationsController, SettingsController],
  providers: [NotificationsRepository, SettingsService],
})
export class NotificationsModule {}
