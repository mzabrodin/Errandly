import { escapeHtml } from './escape.js';
import { renderLayout, renderText, rich, type LayoutOptions, type TaskCardData } from './layout.js';

type FieldType = 'string' | 'url' | 'number' | 'date';

type TemplateData = Record<string, string | number>;

interface TemplateDefinition {
  /** Обов'язкові поля даних; ключ із `?` — необов'язковий */
  fields: Record<string, FieldType>;
  build: (data: TemplateData) => LayoutOptions;
  sample: TemplateData;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_TIMEZONE = 'Europe/Kyiv';
const APP_URL = 'http://localhost:5173';

/** Значення поля як текст (відсутнє поле дає 'undefined', як і раніше в шаблонних рядках) */
function field(data: TemplateData, key: string): string {
  return String(data[key]);
}

/** Відсутня дата дає Invalid Date, як `new Date(undefined)` */
function toDate(iso: string | number | undefined): Date {
  return iso === undefined ? new Date(Number.NaN) : new Date(iso);
}

function formatWhen(
  iso: string | number | undefined,
  timezone: string | number | undefined,
): string {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: String(timezone ?? DEFAULT_TIMEZONE),
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(iso));
}

function formatTime(
  iso: string | number | undefined,
  timezone: string | number | undefined,
): string {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: String(timezone ?? DEFAULT_TIMEZONE),
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(iso));
}

/** Порожні значення ('' / 0 / NaN) вважаються відсутніми */
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
  name: 'Богдан',
  groupName: 'Кімната 12',
  taskTitle: 'Винести сміття',
  dueAt: '2026-10-26T18:00:00.000Z',
  difficulty: 2,
  url: `${APP_URL}/g/g-room12/tasks/task-demo`,
  settingsUrl: `${APP_URL}/settings`,
};

function taskCard(data: TemplateData, tone?: 'danger'): TaskCardData {
  return {
    title: field(data, 'taskTitle'),
    groupName: field(data, 'groupName'),
    when: formatWhen(data['dueAt'], data['timezone']),
    difficulty: Number(data['difficulty']),
    ...(tone === undefined ? {} : { tone }),
  };
}

const NOTIFICATION_NOTE = 'Ви отримали цей лист, бо ви учасник групи в Errandly';

export const templates = {
  verifyEmail: {
    fields: { name: 'string', url: 'url' },
    sample: { name: 'Аня', url: `${APP_URL}/verify-email/demo-token` },
    build: (data) => ({
      subject: 'Підтвердіть email в Errandly',
      preheader: 'Один клік — і можна збирати співмешканців у групу.',
      heading: `привіт, ${field(data, 'name')}!`,
      paragraphs: [
        rich(
          'Дякуємо за реєстрацію в Errandly. Залишився **один крок** — підтвердіть, що це ваша пошта.',
        ),
        rich(
          'Після підтвердження ви зможете створити групу для квартири чи кімнати й запросити співмешканців.',
        ),
      ],
      cta: { label: 'Підтвердити email', url: field(data, 'url') },
      note: 'Якщо ви не реєструвалися в Errandly, просто проігноруйте цей лист.',
    }),
  },

  resetPassword: {
    fields: { name: 'string', url: 'url' },
    sample: { name: 'Аня', url: `${APP_URL}/reset-password/demo-token` },
    build: (data) => ({
      subject: 'Відновлення пароля Errandly',
      preheader: 'Посилання для нового пароля діє 1 годину.',
      heading: 'новий пароль',
      paragraphs: [
        rich(`${field(data, 'name')}, ми отримали запит на зміну пароля до вашого акаунта.`),
        rich('Посилання діє **1 годину** і спрацює лише один раз.'),
      ],
      cta: { label: 'Змінити пароль', url: field(data, 'url') },
      note: 'Не надсилали запит? Нічого не робіть — ваш пароль лишиться без змін.',
    }),
  },

  invite: {
    fields: { inviterName: 'string', groupName: 'string', url: 'url' },
    sample: {
      inviterName: 'Аня Коваль',
      groupName: 'Кімната 12',
      url: `${APP_URL}/invite/demo-token`,
    },
    build: (data) => ({
      subject: `${field(data, 'inviterName')} запрошує вас до «${field(data, 'groupName')}»`,
      preheader: 'Errandly чесно розподіляє побутові задачі між співмешканцями.',
      heading: 'вас запрошують!',
      paragraphs: [
        rich(
          `**${field(data, 'inviterName')}** запрошує вас до групи **«${field(data, 'groupName')}»** в Errandly.`,
        ),
        rich(
          'Errandly сам розподіляє побутові задачі так, щоб навантаження було рівним, і додає їх у ваш Google Calendar. Більше жодних суперечок, чия черга виносити сміття.',
        ),
        rich('Запрошення діє **7 днів**.'),
      ],
      cta: { label: 'Приєднатися до групи', url: field(data, 'url') },
      note: 'Не знаєте, хто це? Просто проігноруйте лист — без переходу за посиланням вас не буде додано до групи.',
    }),
  },

  taskAssigned: {
    fields: taskFields,
    sample: taskSample,
    build: (data) => ({
      subject: `Нова задача: ${field(data, 'taskTitle')}`,
      preheader: `${formatWhen(data['dueAt'], data['timezone'])} · група «${field(data, 'groupName')}»`,
      heading: 'ваша черга!',
      paragraphs: [
        rich(
          `${field(data, 'name')}, вам призначено задачу в групі **«${field(data, 'groupName')}»**. Система обрала вас, бо за останні 4 тижні у вас найменше навантаження.`,
        ),
      ],
      task: taskCard(data),
      cta: { label: 'Відкрити задачу', url: field(data, 'url') },
      note: escapeHtml(NOTIFICATION_NOTE),
      ...settingsUrlOption(data),
    }),
  },

  taskDueSoon: {
    fields: taskFields,
    sample: taskSample,
    build: (data) => ({
      subject: `Нагадування: ${field(data, 'taskTitle')} о ${formatTime(data['dueAt'], data['timezone'])}`,
      preheader: 'До терміну залишилось менше доби.',
      heading: 'скоро термін',
      paragraphs: [
        rich(`${field(data, 'name')}, нагадуємо: до терміну задачі залишилось **менше 24 годин**.`),
        rich('Коли зробите — позначте задачу виконаною, щоб інші бачили.'),
      ],
      task: taskCard(data),
      cta: { label: 'Позначити виконаною', url: field(data, 'url') },
      note: escapeHtml(NOTIFICATION_NOTE),
      ...settingsUrlOption(data),
    }),
  },

  taskOverdue: {
    fields: taskFields,
    sample: { ...taskSample, dueAt: '2026-10-24T18:00:00.000Z' },
    build: (data) => ({
      subject: `Прострочено: ${field(data, 'taskTitle')}`,
      preheader: 'Термін задачі минув, а її не позначено виконаною.',
      heading: 'ой, прострочено',
      paragraphs: [
        rich(`${field(data, 'name')}, термін задачі минув, а її досі не позначено виконаною.`),
        rich(
          'Уже зробили? Позначте її — це займе секунду. Не встигаєте? Домовтеся з адміністратором групи про перенесення.',
        ),
      ],
      task: taskCard(data, 'danger'),
      cta: { label: 'Відкрити задачу', url: field(data, 'url') },
      note: escapeHtml(NOTIFICATION_NOTE),
      ...settingsUrlOption(data),
    }),
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

/** Перевіряє одне поле; повертає помилку або null */
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

/** Перевіряє дані шаблону; повертає список помилок (порожній — усе гаразд) */
export function validateTemplateData(name: TemplateName, data: Record<string, unknown>): string[] {
  const fields: Record<string, FieldType> = templates[name].fields;
  const errors: string[] = [];
  for (const [rawKey, type] of Object.entries(fields)) {
    const error = validateField(rawKey, type, data);
    if (error !== null) errors.push(error);
  }
  return errors;
}

export function renderTemplate(name: TemplateName, data: TemplateData): RenderedMail {
  const options = templates[name].build(data);
  return {
    subject: options.subject,
    html: renderLayout(options),
    text: renderText(options),
  };
}

export function renderSample(name: TemplateName): RenderedMail {
  return renderTemplate(name, templates[name].sample);
}
