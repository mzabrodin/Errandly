import { NotImplementedException } from '@nestjs/common';

import { GoogleAuthController } from '../../auth/google-auth.controller.js';
import { CalendarController } from '../../calendar/calendar.controller.js';
import { NotificationsController } from '../../notifications/notifications.controller.js';
import { SettingsController } from '../../notifications/settings.controller.js';
import { StatsController } from '../../stats/stats.controller.js';
import { TasksController } from '../../tasks/tasks.controller.js';
import { AvatarController } from '../../users/avatar.controller.js';

// Until a module gets its service, every handler of its controller answers 501
const controllers = [
  GoogleAuthController,
  AvatarController,
  CalendarController,
  TasksController,
  NotificationsController,
  SettingsController,
  StatsController,
];

const handlers = controllers.flatMap((Controller) => {
  const instance: object = new Controller();
  return Object.getOwnPropertyNames(Controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => [`${Controller.name}.${name}`, instance, name] as const);
});

describe('stub controllers', () => {
  it.each(handlers)('%s answers 501 NOT_IMPLEMENTED', (_label, instance, name) => {
    const handler: unknown = Reflect.get(instance, name);
    expect(typeof handler).toBe('function');
    expect(() => Reflect.apply(handler as () => unknown, instance, [])).toThrow(
      NotImplementedException,
    );
  });
});
