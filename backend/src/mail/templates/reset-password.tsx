import { z } from 'zod';

import { Rich } from '../i18n.js';
import { Layout, Paragraph } from './layout.js';
import { defineTemplate, httpUrl, SAMPLE_APP_URL, text } from './template.js';

export const resetPassword = defineTemplate({
  schema: z.object({ name: text, url: httpUrl }),
  sample: { name: 'Anya', url: `${SAMPLE_APP_URL}/reset-password/demo-token` },
  subject: (t) => t('resetPassword.subject'),
  Component: ({ data, t, locale, subject }) => (
    <Layout
      locale={locale}
      t={t}
      subject={subject}
      preheader={t('resetPassword.preheader')}
      heading={t('resetPassword.heading')}
      cta={{ label: t('resetPassword.cta'), url: data.url }}
      note={t('resetPassword.note')}
    >
      <Paragraph>{t('resetPassword.paragraph1', { name: data.name })}</Paragraph>
      <Paragraph>
        <Rich t={t} i18nKey="resetPassword.paragraph2" />
      </Paragraph>
    </Layout>
  ),
});
