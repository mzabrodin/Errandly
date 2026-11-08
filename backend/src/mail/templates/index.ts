import { escapeHtml } from './escape.js';
import { renderLayout, renderText, rich, type LayoutOptions, type TaskCardData } from './layout.js';
import { DEFAULT_MAIL_LOCALE, layoutCopy, type MailLocale } from './locale.js';

type FieldType = 'string' | 'url' | 'number' | 'date';

type TemplateData = Record<string, string | number>;

/** Due date of a task email, already formatted for the recipient's language and time zone */
interface DueDate {
  /** Weekday, date and time: "Mon, 26 October, 20:00" */
  when: string;
  /** Time only: "20:00" */
  time: string;
}

/** Localised text of one email. Paragraphs may use **bold**; everything is escaped when rendered */
interface MailCopy {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta: string;
  note: string;
}

interface TemplateDefinition {
  /** Required data fields; a key ending in `?` is optional */
  fields: Record<string, FieldType>;
  sample: TemplateData;
  /** Task emails show a task card in this tone and a link to the notification settings */
  task?: 'default' | 'danger';
  copy: Record<MailLocale, (data: TemplateData, due: DueDate) => MailCopy>;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_TIMEZONE = 'Europe/Kyiv';
const APP_URL = 'http://localhost:5173';

/** Field value as text (a missing field yields 'undefined', as template literals did before) */
function field(data: TemplateData, key: string): string {
  return String(data[key]);
}

/** A missing date yields Invalid Date, like `new Date(undefined)` */
function toDate(iso: string | number | undefined): Date {
  return iso === undefined ? new Date(Number.NaN) : new Date(iso);
}

function formatDue(data: TemplateData, locale: MailLocale): DueDate {
  const date = toDate(data['dueAt']);
  const timeZone = String(data['timezone'] ?? DEFAULT_TIMEZONE);
  const { intlLocale } = layoutCopy[locale];
  const time = { hour: '2-digit', minute: '2-digit', timeZone } as const;
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

/** Empty values ('' / 0 / NaN) count as missing */
function isFilled(value: string | number | undefined): value is string | number {
  if (value === undefined) return false;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return value !== '';
}

function settingsUrlOption(data: TemplateData): { settingsUrl?: string } {
  const value = data['settingsUrl'];
  return isFilled(value) ? { settingsUrl: String(value) } : {};
}

const taskFields = {
  name: 'string',
  groupName: 'string',
  taskTitle: 'string',
  dueAt: 'date',
  difficulty: 'number',
  url: 'url',
  'settingsUrl?': 'url',
  'timezone?': 'string',
} as const satisfies Record<string, FieldType>;

const taskSample = {
  name: 'Bohdan',
  groupName: 'Room 12',
  taskTitle: 'Take out the trash',
  dueAt: '2026-10-26T18:00:00.000Z',
  difficulty: 2,
  url: `${APP_URL}/g/g-room12/tasks/task-demo`,
  settingsUrl: `${APP_URL}/settings`,
};

const NOTIFICATION_NOTE: Record<MailLocale, string> = {
  uk: 'Ви отримали цей лист, бо ви учасник групи в Errandly',
  en: 'You received this email because you are a member of a group in Errandly',
};

export const templates = {
  verifyEmail: {
    fields: { name: 'string', url: 'url' },
    sample: { name: 'Anya', url: `${APP_URL}/verify-email/demo-token` },
    copy: {
      uk: (data) => ({
        subject: 'Підтвердіть email в Errandly',
        preheader: 'Один клік — і можна збирати співмешканців у групу.',
        heading: `привіт, ${field(data, 'name')}!`,
        paragraphs: [
          'Дякуємо за реєстрацію в Errandly. Залишився **один крок** — підтвердіть, що це ваша пошта.',
          'Після підтвердження ви зможете створити групу для квартири чи кімнати й запросити співмешканців.',
        ],
        cta: 'Підтвердити email',
        note: 'Якщо ви не реєструвалися в Errandly, просто проігноруйте цей лист.',
      }),
      en: (data) => ({
        subject: 'Verify your email for Errandly',
        preheader: 'One click and you can start gathering your flatmates.',
        heading: `hi, ${field(data, 'name')}!`,
        paragraphs: [
          'Thanks for signing up for Errandly. There’s **one step left**: confirm that this is your email.',
          'Once verified, you can create a group for your flat or room and invite your flatmates.',
        ],
        cta: 'Verify email',
        note: 'If you didn’t sign up for Errandly, just ignore this email.',
      }),
    },
  },

  resetPassword: {
    fields: { name: 'string', url: 'url' },
    sample: { name: 'Anya', url: `${APP_URL}/reset-password/demo-token` },
    copy: {
      uk: (data) => ({
        subject: 'Відновлення пароля Errandly',
        preheader: 'Посилання для нового пароля діє 1 годину.',
        heading: 'новий пароль',
        paragraphs: [
          `${field(data, 'name')}, ми отримали запит на зміну пароля до вашого акаунта.`,
          'Посилання діє **1 годину** і спрацює лише один раз.',
        ],
        cta: 'Змінити пароль',
        note: 'Не надсилали запит? Нічого не робіть — ваш пароль лишиться без змін.',
      }),
      en: (data) => ({
        subject: 'Reset your Errandly password',
        preheader: 'The link for a new password is valid for 1 hour.',
        heading: 'new password',
        paragraphs: [
          `${field(data, 'name')}, we received a request to change the password for your account.`,
          'The link is valid for **1 hour** and works only once.',
        ],
        cta: 'Change password',
        note: 'Didn’t request this? Do nothing — your password stays the same.',
      }),
    },
  },

  invite: {
    fields: { inviterName: 'string', groupName: 'string', url: 'url' },
    sample: {
      inviterName: 'Anya Koval',
      groupName: 'Room 12',
      url: `${APP_URL}/invite/demo-token`,
    },
    copy: {
      uk: (data) => ({
        subject: `${field(data, 'inviterName')} запрошує вас до «${field(data, 'groupName')}»`,
        preheader: 'Errandly чесно розподіляє побутові задачі між співмешканцями.',
        heading: 'вас запрошують!',
        paragraphs: [
          `**${field(data, 'inviterName')}** запрошує вас до групи **«${field(data, 'groupName')}»** в Errandly.`,
          'Errandly сам розподіляє побутові задачі так, щоб навантаження було рівним, і додає їх у ваш Google Calendar. Більше жодних суперечок, чия черга виносити сміття.',
          'Запрошення діє **7 днів**.',
        ],
        cta: 'Приєднатися до групи',
        note: 'Не знаєте, хто це? Просто проігноруйте лист — без переходу за посиланням вас не буде додано до групи.',
      }),
      en: (data) => ({
        subject: `${field(data, 'inviterName')} invites you to “${field(data, 'groupName')}”`,
        preheader: 'Errandly splits household chores fairly between flatmates.',
        heading: 'you’re invited!',
        paragraphs: [
          `**${field(data, 'inviterName')}** invites you to the group **“${field(data, 'groupName')}”** in Errandly.`,
          'Errandly splits household chores so that everyone’s workload is even, and adds them to your Google Calendar. No more arguing about whose turn it is to take out the trash.',
          'The invitation is valid for **7 days**.',
        ],
        cta: 'Join the group',
        note: 'Don’t know who this is? Just ignore this email — you won’t be added to the group unless you follow the link.',
      }),
    },
  },

  taskAssigned: {
    fields: taskFields,
    sample: taskSample,
    task: 'default',
    copy: {
      uk: (data, due) => ({
        subject: `Нова задача: ${field(data, 'taskTitle')}`,
        preheader: `${due.when} · група «${field(data, 'groupName')}»`,
        heading: 'ваша черга!',
        paragraphs: [
          `${field(data, 'name')}, вам призначено задачу в групі **«${field(data, 'groupName')}»**. Система обрала вас, бо за останні 4 тижні у вас найменше навантаження.`,
        ],
        cta: 'Відкрити задачу',
        note: NOTIFICATION_NOTE.uk,
      }),
      en: (data, due) => ({
        subject: `New task: ${field(data, 'taskTitle')}`,
        preheader: `${due.when} · group “${field(data, 'groupName')}”`,
        heading: 'your turn!',
        paragraphs: [
          `${field(data, 'name')}, you’ve been assigned a task in the group **“${field(data, 'groupName')}”**. The system picked you because you have the lowest workload over the last 4 weeks.`,
        ],
        cta: 'Open task',
        note: NOTIFICATION_NOTE.en,
      }),
    },
  },

  taskDueSoon: {
    fields: taskFields,
    sample: taskSample,
    task: 'default',
    copy: {
      uk: (data, due) => ({
        subject: `Нагадування: ${field(data, 'taskTitle')} о ${due.time}`,
        preheader: 'До терміну залишилось менше доби.',
        heading: 'скоро термін',
        paragraphs: [
          `${field(data, 'name')}, нагадуємо: до терміну задачі залишилось **менше 24 годин**.`,
          'Коли зробите — позначте задачу виконаною, щоб інші бачили.',
        ],
        cta: 'Позначити виконаною',
        note: NOTIFICATION_NOTE.uk,
      }),
      en: (data, due) => ({
        subject: `Reminder: ${field(data, 'taskTitle')} at ${due.time}`,
        preheader: 'Less than a day left until the due date.',
        heading: 'due soon',
        paragraphs: [
          `${field(data, 'name')}, a reminder: the task is due in **less than 24 hours**.`,
          'Once it’s done, mark the task as done so everyone can see.',
        ],
        cta: 'Mark as done',
        note: NOTIFICATION_NOTE.en,
      }),
    },
  },

  taskOverdue: {
    fields: taskFields,
    sample: { ...taskSample, dueAt: '2026-10-24T18:00:00.000Z' },
    task: 'danger',
    copy: {
      uk: (data) => ({
        subject: `Прострочено: ${field(data, 'taskTitle')}`,
        preheader: 'Термін задачі минув, а її не позначено виконаною.',
        heading: 'ой, прострочено',
        paragraphs: [
          `${field(data, 'name')}, термін задачі минув, а її досі не позначено виконаною.`,
          'Уже зробили? Позначте її — це займе секунду. Не встигаєте? Домовтеся з адміністратором групи про перенесення.',
        ],
        cta: 'Відкрити задачу',
        note: NOTIFICATION_NOTE.uk,
      }),
      en: (data) => ({
        subject: `Overdue: ${field(data, 'taskTitle')}`,
        preheader: 'The task is past its due date and hasn’t been marked as done.',
        heading: 'oops, overdue',
        paragraphs: [
          `${field(data, 'name')}, the task is past its due date and still isn’t marked as done.`,
          'Already done? Mark it — it takes a second. Running late? Agree on a new date with the group admin.',
        ],
        cta: 'Open task',
        note: NOTIFICATION_NOTE.en,
      }),
    },
  },
} satisfies Record<string, TemplateDefinition>;

export type TemplateName = keyof typeof templates;

export function isTemplateName(value: string): value is TemplateName {
  return Object.hasOwn(templates, value);
}

export const templateNames: TemplateName[] = Object.keys(templates).filter(isTemplateName);

const validators: Record<FieldType, (value: unknown) => boolean> = {
  string: (value) => typeof value === 'string' && value.length <= 200,
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  date: (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)),
  url: (value) => typeof value === 'string' && /^https?:\/\/[^\s"<>]+$/.test(value),
};

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Validates one field; returns an error or null */
function validateField(
  rawKey: string,
  type: FieldType,
  data: Record<string, unknown>,
): string | null {
  const optional = rawKey.endsWith('?');
  const key = optional ? rawKey.slice(0, -1) : rawKey;
  const value = data[key];
  if (isMissing(value)) return optional ? null : `${key} is required`;
  return validators[type](value) ? null : `${key} must be a valid ${type}`;
}

/** Validates template data; returns a list of errors (empty means valid) */
export function validateTemplateData(name: TemplateName, data: Record<string, unknown>): string[] {
  const fields: Record<string, FieldType> = templates[name].fields;
  const errors: string[] = [];
  for (const [rawKey, type] of Object.entries(fields)) {
    const error = validateField(rawKey, type, data);
    if (error !== null) errors.push(error);
  }
  return errors;
}

function taskCard(data: TemplateData, due: DueDate, tone: 'default' | 'danger'): TaskCardData {
  return {
    title: field(data, 'taskTitle'),
    groupName: field(data, 'groupName'),
    when: due.when,
    difficulty: Number(data['difficulty']),
    tone,
  };
}

const NO_DUE_DATE: DueDate = { when: '', time: '' };

function buildLayout(name: TemplateName, data: TemplateData, locale: MailLocale): LayoutOptions {
  const definition: TemplateDefinition = templates[name];
  const task = definition.task;
  // Only task emails have a due date; formatting a missing one would throw
  const due = task === undefined ? NO_DUE_DATE : formatDue(data, locale);
  const copy = definition.copy[locale](data, due);
  return {
    locale,
    subject: copy.subject,
    preheader: copy.preheader,
    heading: copy.heading,
    paragraphs: copy.paragraphs.map(rich),
    cta: { label: copy.cta, url: field(data, 'url') },
    note: escapeHtml(copy.note),
    ...(task === undefined ? {} : { task: taskCard(data, due, task), ...settingsUrlOption(data) }),
  };
}

export function renderTemplate(
  name: TemplateName,
  data: TemplateData,
  locale: MailLocale = DEFAULT_MAIL_LOCALE,
): RenderedMail {
  const options = buildLayout(name, data, locale);
  return {
    subject: options.subject,
    html: renderLayout(options),
    text: renderText(options),
  };
}

export function renderSample(
  name: TemplateName,
  locale: MailLocale = DEFAULT_MAIL_LOCALE,
): RenderedMail {
  return renderTemplate(name, templates[name].sample, locale);
}
