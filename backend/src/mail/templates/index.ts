import type { z } from 'zod';

import { DEFAULT_LOCALE, type Locale } from '../../common/domain.js';
import { invite } from './invite.js';
import { resetPassword } from './reset-password.js';
import { taskAssigned } from './task-assigned.js';
import { taskDueSoon } from './task-due-soon.js';
import { taskOverdue } from './task-overdue.js';
import type { RenderedMail } from './template.js';
import { verifyEmail } from './verify-email.js';

export type { RenderedMail } from './template.js';

export const templates = {
  verifyEmail,
  resetPassword,
  invite,
  taskAssigned,
  taskDueSoon,
  taskOverdue,
};

export type TemplateName = keyof typeof templates;

/** The data a template takes, from its zod schema */
export type MailData<T extends TemplateName> = z.input<(typeof templates)[T]['schema']>;

export function isTemplateName(value: string): value is TemplateName {
  return Object.hasOwn(templates, value);
}

export const templateNames: TemplateName[] = Object.keys(templates).filter(isTemplateName);

export function renderTemplate<T extends TemplateName>(
  name: T,
  data: MailData<T>,
  locale: Locale = DEFAULT_LOCALE,
): Promise<RenderedMail> {
  return templates[name].render(data, locale);
}

export function renderSample(
  name: TemplateName,
  locale: Locale = DEFAULT_LOCALE,
): Promise<RenderedMail> {
  const template = templates[name];
  return template.render(template.sample, locale);
}

export type ParsedTemplateData = { data: MailData<TemplateName> } | { errors: string[] };

/** Checks untyped data (the dev endpoint): the data, or one message per invalid field */
export function parseTemplateData(name: TemplateName, data: unknown): ParsedTemplateData {
  const result = templates[name].schema.safeParse(data);
  if (result.success) return { data: result.data };
  return {
    errors: result.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    ),
  };
}
