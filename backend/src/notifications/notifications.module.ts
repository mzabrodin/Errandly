import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller.js';
import { SettingsController } from './settings.controller.js';

@Module({
  controllers: [NotificationsController, SettingsController],
})
export class NotificationsModule {}
