import { Rich } from '../i18n.js';
import { Paragraph } from './layout.js';
import { formatDue, TaskEmail, taskSample, taskSchema } from './task-email.js';
import { defineTemplate } from './template.js';

export const taskAssigned = defineTemplate({
  schema: taskSchema,
  sample: taskSample,
  subject: (t, data) => t('taskAssigned.subject', { taskTitle: data.taskTitle }),
  Component: (props) => {
    const { data, t, locale } = props;
    return (
      <TaskEmail
        {...props}
        tone="default"
        preheader={t('taskAssigned.preheader', {
          when: formatDue(data, locale).when,
          groupName: data.groupName,
        })}
        heading={t('taskAssigned.heading')}
        cta={t('taskAssigned.cta')}
      >
        <Paragraph>
          <Rich
            t={t}
            i18nKey="taskAssigned.paragraph1"
            values={{ name: data.name, groupName: data.groupName }}
          />
        </Paragraph>
      </TaskEmail>
    );
  },
});
