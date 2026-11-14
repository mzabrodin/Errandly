import type { ReactElement, ReactNode } from 'react';
import { z } from 'zod';

import { LIMITS, type Locale } from '../../common/domain.js';
import { isTimeZone } from '../../common/validation/validators.js';
import { INTL_LOCALES, type MailT } from '../i18n.js';
import { Layout, TaskCard } from './layout.js';
import { httpUrl, SAMPLE_APP_URL, text, type TemplateProps } from './template.js';

const DEFAULT_TIMEZONE = 'Europe/Kyiv';
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

export const taskSchema = z.object({
  name: text,
  groupName: text,
  taskTitle: text,
  dueAt: z.iso.datetime({ offset: true }),
  difficulty: z.int().min(LIMITS.difficultyMin).max(LIMITS.difficultyMax),
  url: httpUrl,
  settingsUrl: httpUrl.optional(),
  /** The recipient's profile time zone; the due date is shown in it */
  timezone: z.string().refine(isTimeZone, 'must be an IANA time zone').default(DEFAULT_TIMEZONE),
});

export type TaskData = z.output<typeof taskSchema>;

export const taskSample = {
  name: 'Bohdan',
  groupName: 'Room 12',
  taskTitle: 'Take out the trash',
  dueAt: '2026-10-26T18:00:00.000Z',
  difficulty: 2,
  url: `${SAMPLE_APP_URL}/g/g-room12/tasks/task-demo`,
  settingsUrl: `${SAMPLE_APP_URL}/settings`,
} satisfies z.input<typeof taskSchema>;

export interface DueDate {
  /** Weekday, date and time: "Mon, 26 October, 20:00" */
  when: string;
  /** Time only: "20:00" */
  time: string;
}

export function formatDue(data: Pick<TaskData, 'dueAt' | 'timezone'>, locale: Locale): DueDate {
  const date = new Date(data.dueAt);
  const time = { hour: '2-digit', minute: '2-digit', timeZone: data.timezone } as const;
  const intlLocale = INTL_LOCALES[locale];
  return {
    when: new Intl.DateTimeFormat(intlLocale, {
      ...time,
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(date),
    time: new Intl.DateTimeFormat(intlLocale, time).format(date),
  };
}

/** "1 day", "3 hours", "15 minutes", with the plural form of the language */
export function formatDuration(t: MailT, minutes: number): string {
  if (minutes % MINUTES_PER_DAY === 0) {
    return t('duration.days', { count: minutes / MINUTES_PER_DAY });
  }
  if (minutes % MINUTES_PER_HOUR === 0) {
    return t('duration.hours', { count: minutes / MINUTES_PER_HOUR });
  }
  return t('duration.minutes', { count: minutes });
}

interface TaskEmailProps extends TemplateProps<TaskData> {
  preheader: string;
  heading: string;
  cta: string;
  tone: 'default' | 'danger';
  children: ReactNode;
}

/** Task emails show a task card and a link to the notification settings */
export function TaskEmail(props: TaskEmailProps): ReactElement {
  const { data, t, locale, subject, preheader, heading, cta, tone, children } = props;
  return (
    <Layout
      locale={locale}
      t={t}
      subject={subject}
      preheader={preheader}
      heading={heading}
      cta={{ label: cta, url: data.url }}
      note={t('layout.taskNote')}
      settingsUrl={data.settingsUrl}
    >
      {children}
      <TaskCard
        t={t}
        title={data.taskTitle}
        groupName={data.groupName}
        when={formatDue(data, locale).when}
        difficulty={data.difficulty}
        tone={tone}
      />
    </Layout>
  );
}
