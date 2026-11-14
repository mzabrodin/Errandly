import { z } from 'zod';

import { Rich } from '../i18n.js';
import { Layout, Paragraph } from './layout.js';
import { defineTemplate, httpUrl, SAMPLE_APP_URL, text } from './template.js';

export const invite = defineTemplate({
  schema: z.object({ inviterName: text, groupName: text, url: httpUrl }),
  sample: {
    inviterName: 'Anya Koval',
    groupName: 'Room 12',
    url: `${SAMPLE_APP_URL}/invite/demo-token`,
  },
  subject: (t, data) =>
    t('invite.subject', { inviterName: data.inviterName, groupName: data.groupName }),
  Component: ({ data, t, locale, subject }) => (
    <Layout
      locale={locale}
      t={t}
      subject={subject}
      preheader={t('invite.preheader')}
      heading={t('invite.heading')}
      cta={{ label: t('invite.cta'), url: data.url }}
      note={t('invite.note')}
    >
      <Paragraph>
        <Rich
          t={t}
          i18nKey="invite.paragraph1"
          values={{ inviterName: data.inviterName, groupName: data.groupName }}
        />
      </Paragraph>
      <Paragraph>{t('invite.paragraph2')}</Paragraph>
      <Paragraph>
        <Rich t={t} i18nKey="invite.paragraph3" />
      </Paragraph>
    </Layout>
  ),
});
