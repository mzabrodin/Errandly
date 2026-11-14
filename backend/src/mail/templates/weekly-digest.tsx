import { Heading } from '@react-email/heading';
import { z } from 'zod';

import { LIMITS } from '../../common/domain.js';
import { Rich } from '../i18n.js';
import { Layout, Paragraph } from './layout.js';
import { formatDue, timeZone } from './task-email.js';
import { defineTemplate, httpUrl, SAMPLE_APP_URL, text } from './template.js';
import { theme as c } from './theme.js';

const MAX_GROUPS = 20;
const MAX_TASKS = 50;

const digestTask = z.object({
  title: text,
  dueAt: z.iso.datetime({ offset: true }),
  difficulty: z.int().min(LIMITS.difficultyMin).max(LIMITS.difficultyMax),
  url: httpUrl,
});

const digestGroup = z.object({
  name: text,
  done: z.int().min(0),
  overdue: z.int().min(0),
  tasks: z.array(digestTask).max(MAX_TASKS),
});

export const weeklyDigest = defineTemplate({
  schema: z.object({
    name: text,
    url: httpUrl,
    settingsUrl: httpUrl,
    timezone: timeZone,
    groups: z.array(digestGroup).min(1).max(MAX_GROUPS),
  }),
  sample: {
    name: 'Anya',
    url: SAMPLE_APP_URL,
    settingsUrl: `${SAMPLE_APP_URL}/settings`,
    groups: [
      {
        name: 'Room 12',
        done: 4,
        overdue: 1,
        tasks: [
          {
            title: 'Take out the trash',
            dueAt: '2026-10-26T18:00:00.000Z',
            difficulty: 2,
            url: `${SAMPLE_APP_URL}/g/g-room12/tasks/task-demo`,
          },
          {
            title: 'Clean the bathroom',
            dueAt: '2026-10-29T10:00:00.000Z',
            difficulty: 4,
            url: `${SAMPLE_APP_URL}/g/g-room12/tasks/task-demo-2`,
          },
        ],
      },
    ],
  },
  subject: (t, data) =>
    t('weeklyDigest.subject', {
      count: data.groups.reduce((sum, group) => sum + group.tasks.length, 0),
    }),
  Component: ({ data, t, locale, subject }) => (
    <Layout
      locale={locale}
      t={t}
      subject={subject}
      preheader={t('weeklyDigest.preheader')}
      heading={t('weeklyDigest.heading')}
      cta={{ label: t('weeklyDigest.cta'), url: data.url }}
      note={t('weeklyDigest.note')}
      settingsUrl={data.settingsUrl}
    >
      <Paragraph>{t('weeklyDigest.paragraph1', { name: data.name })}</Paragraph>
      {data.groups.map((group) => (
        <div key={group.name} style={{ margin: '0 0 18px' }}>
          <Heading
            as="h2"
            style={{
              margin: '0 0 8px',
              fontFamily: c.display,
              fontSize: 19,
              fontWeight: 800,
              color: c.ink,
            }}
          >
            {group.name}
          </Heading>
          <Paragraph>
            <Rich
              t={t}
              i18nKey="weeklyDigest.lastWeek"
              values={{ done: group.done, overdue: group.overdue }}
            />
          </Paragraph>
          {group.tasks.length === 0 ? (
            <Paragraph>{t('weeklyDigest.nothingAhead')}</Paragraph>
          ) : (
            group.tasks.map((task) => (
              <Paragraph key={task.url}>
                <a href={task.url} style={{ color: c.ink, fontWeight: 700 }}>
                  {task.title}
                </a>{' '}
                · {formatDue({ dueAt: task.dueAt, timezone: data.timezone }, locale).when}
              </Paragraph>
            ))
          )}
        </div>
      ))}
    </Layout>
  ),
});
