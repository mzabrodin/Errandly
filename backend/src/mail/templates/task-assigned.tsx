import { Rich } from '../i18n.js';
import { Paragraph } from './layout.js';
import { formatDue, TaskEmail, taskSample, taskSchema } from './task-email.js';
import { defineTemplate, text } from './template.js';

export const taskAssigned = defineTemplate({
  /** actorName: who assigned it by hand; without it the algorithm picked the assignee */
  schema: taskSchema.extend({ actorName: text.optional() }),
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
          {data.actorName === undefined ? (
            <Rich
              t={t}
              i18nKey="taskAssigned.paragraph1"
              values={{ name: data.name, groupName: data.groupName }}
            />
          ) : (
            <Rich
              t={t}
              i18nKey="taskAssigned.paragraphByActor"
              values={{ name: data.name, groupName: data.groupName, actorName: data.actorName }}
            />
          )}
        </Paragraph>
      </TaskEmail>
    );
  },
});
