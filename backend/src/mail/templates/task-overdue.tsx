import { Paragraph } from './layout.js';
import { TaskEmail, taskSample, taskSchema } from './task-email.js';
import { defineTemplate } from './template.js';

export const taskOverdue = defineTemplate({
  schema: taskSchema,
  sample: { ...taskSample, dueAt: '2026-10-24T18:00:00.000Z' },
  subject: (t, data) => t('taskOverdue.subject', { taskTitle: data.taskTitle }),
  Component: (props) => {
    const { data, t } = props;
    return (
      <TaskEmail
        {...props}
        tone="danger"
        preheader={t('taskOverdue.preheader')}
        heading={t('taskOverdue.heading')}
        cta={t('taskOverdue.cta')}
      >
        <Paragraph>{t('taskOverdue.paragraph1', { name: data.name })}</Paragraph>
        <Paragraph>{t('taskOverdue.paragraph2')}</Paragraph>
      </TaskEmail>
    );
  },
});
