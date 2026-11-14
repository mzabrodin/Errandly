import { render, type Options } from '@react-email/render';
import type { ReactElement } from 'react';
import { z } from 'zod';

import type { Locale } from '../../common/domain.js';
import { mailT, type MailT } from '../i18n.js';

/** Links in the samples point at the Vite dev server */
export const SAMPLE_APP_URL = 'http://localhost:5173';

export const text = z.string().min(1).max(200);
export const httpUrl = z.string().regex(/^https?:\/\/[^\s"<>]+$/, 'must be an http(s) URL');

/** The plain-text part: the decorations are skipped (data-skip-in-text), the pills joined with "·" */
const PLAIN_TEXT: Options = {
  plainText: true,
  htmlToTextOptions: {
    selectors: [
      { selector: 'h1', options: { uppercase: false } },
      {
        selector: 'span[data-pill] + span[data-pill]',
        format: 'inlineSurround',
        options: { prefix: ' · ' },
      },
    ],
  },
};

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateProps<Data> {
  data: Data;
  t: MailT;
  locale: Locale;
  subject: string;
}

interface TemplateDefinition<Schema extends z.ZodType> {
  schema: Schema;
  sample: z.input<Schema>;
  subject: (t: MailT, data: z.output<Schema>, locale: Locale) => string;
  Component: (props: TemplateProps<z.output<Schema>>) => ReactElement;
}

export interface MailTemplate<Schema extends z.ZodType> {
  schema: Schema;
  sample: z.input<Schema>;
  /** Throws a ZodError when the data does not match the schema */
  render: (data: unknown, locale: Locale) => Promise<RenderedMail>;
}

export function defineTemplate<Schema extends z.ZodType>(
  definition: TemplateDefinition<Schema>,
): MailTemplate<Schema> {
  const { schema, sample, subject, Component } = definition;
  return {
    schema,
    sample,
    async render(input, locale) {
      const data = schema.parse(input);
      const t = mailT(locale);
      const title = subject(t, data, locale);
      const element = <Component data={data} t={t} locale={locale} subject={title} />;
      const [html, plainText] = await Promise.all([render(element), render(element, PLAIN_TEXT)]);
      // Skipped decorations leave empty rows behind
      return { subject: title, html, text: plainText.replace(/\n{3,}/g, '\n\n') };
    },
  };
}
