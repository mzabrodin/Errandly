import { z } from 'zod';

import { Rich } from '../i18n.js';
import { Layout, Paragraph } from './layout.js';
import { defineTemplate, httpUrl, SAMPLE_APP_URL, text } from './template.js';

export const verifyEmail = defineTemplate({
  schema: z.object({ name: text, url: httpUrl }),
  sample: { name: 'Anya', url: `${SAMPLE_APP_URL}/verify-email/demo-token` },
  subject: (t) => t('verifyEmail.subject'),
  Component: ({ data, t, locale, subject }) => (
    <Layout
      locale={locale}
      t={t}
      subject={subject}
      preheader={t('verifyEmail.preheader')}
      heading={t('verifyEmail.heading', { name: data.name })}
      cta={{ label: t('verifyEmail.cta'), url: data.url }}
      note={t('verifyEmail.note')}
    >
      <Paragraph>
        <Rich t={t} i18nKey="verifyEmail.paragraph1" />
      </Paragraph>
      <Paragraph>{t('verifyEmail.paragraph2')}</Paragraph>
    </Layout>
  ),
});
