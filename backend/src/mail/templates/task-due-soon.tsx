import { z } from 'zod';

import { REMINDER_MINUTES } from '../../common/domain.js';
import { Rich } from '../i18n.js';
import { Paragraph } from './layout.js';
import { formatDue, formatDuration, TaskEmail, taskSample, taskSchema } from './task-email.js';
import { defineTemplate } from './template.js';

export const taskDueSoon = defineTemplate({
  /** reminderMinutes: the recipient's email reminder time (notification settings) */
  schema: taskSchema.extend({ reminderMinutes: z.literal(REMINDER_MINUTES) }),
  sample: { ...taskSample, reminderMinutes: 1440 },
  subject: (t, data, locale) =>
    t('taskDueSoon.subject', { taskTitle: data.taskTitle, time: formatDue(data, locale).time }),
  Component: (props) => {
    const { data, t } = props;
    const duration = formatDuration(t, data.reminderMinutes);
    return (
      <TaskEmail
        {...props}
        tone="default"
        preheader={t('taskDueSoon.preheader', { duration })}
        heading={t('taskDueSoon.heading')}
        cta={t('taskDueSoon.cta')}
      >
        <Paragraph>
          <Rich t={t} i18nKey="taskDueSoon.paragraph1" values={{ name: data.name, duration }} />
        </Paragraph>
        <Paragraph>{t('taskDueSoon.paragraph2')}</Paragraph>
      </TaskEmail>
    );
  },
});
