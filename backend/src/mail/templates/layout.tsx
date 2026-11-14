import { Body } from '@react-email/body';
import { Button } from '@react-email/button';
import { Column } from '@react-email/column';
import { Container } from '@react-email/container';
import { Head } from '@react-email/head';
import { Heading } from '@react-email/heading';
import { Html } from '@react-email/html';
import { Link } from '@react-email/link';
import { Preview } from '@react-email/preview';
import { Row } from '@react-email/row';
import { Text } from '@react-email/text';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type { Locale } from '../../common/domain.js';
import type { MailT } from '../i18n.js';
import { theme as c } from './theme.js';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Unbounded:wght@700;800&display=swap';

const MOBILE_CSS = `@media (max-width: 600px) {
  .container { width: 100% !important; }
  .px { padding-left: 22px !important; padding-right: 22px !important; }
  .logo { font-size: 34px !important; }
}`;

const pillStyle: CSSProperties = {
  display: 'inline-block',
  margin: '0 6px 6px 0',
  padding: '4px 12px',
  border: `1.5px solid ${c.ink}`,
  borderRadius: 999,
  fontFamily: c.body,
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.3,
  color: c.ink,
  whiteSpace: 'nowrap',
};

const smallText: CSSProperties = {
  fontFamily: c.body,
  fontSize: 12.5,
  lineHeight: 1.5,
};

function Pill({ background, children }: { background: string; children: ReactNode }): ReactElement {
  return (
    <span data-pill style={{ ...pillStyle, background }}>
      {children}
    </span>
  );
}

function Stripe({ height, background, border }: StripeProps): ReactElement {
  return (
    <Row>
      <Column
        data-skip-in-text
        style={{ height, lineHeight: `${height}px`, fontSize: 0, background, ...border }}
      >
        &nbsp;
      </Column>
    </Row>
  );
}

interface StripeProps {
  height: number;
  background: string;
  border: CSSProperties;
}

export function Paragraph({ children }: { children: ReactNode }): ReactElement {
  return (
    <Text
      style={{
        margin: '0 0 14px',
        fontFamily: c.body,
        fontSize: 16,
        lineHeight: 1.6,
        color: c.ink,
      }}
    >
      {children}
    </Text>
  );
}

export interface TaskCardProps {
  t: MailT;
  title: string;
  groupName: string;
  when: string;
  difficulty: number;
  tone: 'default' | 'danger';
}

export function TaskCard({
  t,
  title,
  groupName,
  when,
  difficulty,
  tone,
}: TaskCardProps): ReactElement {
  const danger = tone === 'danger';
  const border = danger ? c.danger : c.ink;
  const blocks = '■'.repeat(difficulty) + '□'.repeat(5 - difficulty);
  return (
    <Row style={{ margin: '8px 0 24px', borderCollapse: 'separate' }}>
      <Column
        style={{
          padding: '20px 22px 14px',
          border: `2px solid ${border}`,
          borderRadius: 18,
          background: danger ? '#fff3ef' : c.cream,
          boxShadow: `4px 4px 0 ${border}`,
        }}
      >
        <div
          style={{
            margin: '0 0 12px',
            fontFamily: c.display,
            fontSize: 22,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: -0.5,
            color: c.ink,
          }}
        >
          {title}
        </div>
        <Pill background={danger ? c.coral : c.lime}>{when}</Pill>
        <Pill background={c.paper}>
          {t('layout.difficulty')}{' '}
          <span style={{ letterSpacing: 1, color: c.grass }}>{blocks}</span>
        </Pill>
        <Pill background={c.sky}>{groupName}</Pill>
      </Column>
    </Row>
  );
}

function CtaButton({ label, url }: { label: string; url: string }): ReactElement {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: '8px 0 20px', borderCollapse: 'separate' }}
    >
      <tbody>
        <tr>
          <td style={{ borderRadius: 999, background: c.ink, boxShadow: `3px 3px 0 ${c.leaf}` }}>
            <Button
              href={url}
              style={{
                padding: '15px 30px',
                border: `2px solid ${c.ink}`,
                borderRadius: 999,
                fontFamily: c.body,
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1,
                color: c.cream,
              }}
            >
              {label} →
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Header({ t }: { t: MailT }): ReactElement {
  return (
    <Row>
      <Column
        className="px"
        style={{
          padding: '30px 34px 22px',
          background: c.sky,
          backgroundImage: `linear-gradient(180deg,#8ec3ea,${c.sky})`,
        }}
      >
        <Row>
          <Column style={{ verticalAlign: 'bottom' }}>
            <div
              className="logo"
              style={{
                fontFamily: c.display,
                fontSize: 42,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: -2,
                color: c.ink,
              }}
            >
              errandly<span style={{ color: c.grass }}>*</span>
            </div>
            <span
              data-skip-in-text
              style={{
                ...pillStyle,
                margin: '12px 0 0',
                padding: '5px 14px',
                background: c.lime,
                whiteSpace: 'normal',
                lineHeight: 'normal',
              }}
            >
              {t('layout.tagline')}
            </span>
          </Column>
          <Column
            data-skip-in-text
            align="right"
            width={76}
            style={{
              verticalAlign: 'top',
              fontFamily: c.display,
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 0.8,
              color: c.lime,
              textShadow: `3px 3px 0 ${c.ink}`,
            }}
          >
            *
          </Column>
        </Row>
      </Column>
    </Row>
  );
}

interface ContentProps {
  t: MailT;
  heading: string;
  cta: { label: string; url: string };
  children: ReactNode;
}

function Content({ t, heading, cta, children }: ContentProps): ReactElement {
  return (
    <Row>
      <Column className="px" style={{ padding: '34px 34px 10px' }}>
        <Heading
          as="h1"
          style={{
            margin: '0 0 16px',
            fontFamily: c.display,
            fontSize: 30,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: c.ink,
          }}
        >
          {heading}
        </Heading>
        {children}
        <CtaButton label={cta.label} url={cta.url} />
        <Text data-skip-in-text style={{ ...smallText, margin: '0 0 26px', color: c.inkSoft }}>
          {t('layout.buttonFallback')}
          <br />
          <Link
            href={cta.url}
            style={{ color: c.inkSoft, textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {cta.url}
          </Link>
        </Text>
      </Column>
    </Row>
  );
}

interface NoteProps {
  t: MailT;
  note: string;
  settingsUrl: string | undefined;
}

function Note({ t, note, settingsUrl }: NoteProps): ReactElement {
  return (
    <Row>
      <Column
        className="px"
        style={{ ...smallText, padding: '18px 34px', background: c.ink, color: c.creamDeep }}
      >
        {note}
        {settingsUrl === undefined ? null : (
          <>
            {' · '}
            <Link
              href={settingsUrl}
              style={{ color: c.lime, fontWeight: 700, textDecoration: 'underline' }}
            >
              {t('layout.manageNotifications')}
            </Link>
          </>
        )}
      </Column>
    </Row>
  );
}

export interface LayoutProps {
  locale: Locale;
  t: MailT;
  subject: string;
  preheader: string;
  heading: string;
  cta: { label: string; url: string };
  note: string;
  settingsUrl?: string | undefined;
  children: ReactNode;
}

export function Layout(props: LayoutProps): ReactElement {
  const { locale, t, subject, preheader, heading, cta, note, settingsUrl, children } = props;
  return (
    <Html lang={locale}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <title>{subject}</title>
        <link href={FONTS} rel="stylesheet" />
        <style>{MOBILE_CSS}</style>
      </Head>
      <Body style={{ margin: 0, padding: 0, background: c.cream }}>
        <Preview>{preheader}</Preview>
        <Row
          style={{
            background: c.cream,
            backgroundImage: `linear-gradient(${c.creamDeep} 1px, transparent 1px),linear-gradient(90deg, ${c.creamDeep} 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        >
          <Column align="center" style={{ padding: '36px 18px 36px 12px' }}>
            <Container
              className="container"
              width={560}
              style={{
                width: 560,
                maxWidth: 560,
                border: `2px solid ${c.ink}`,
                borderRadius: 26,
                background: c.paper,
                overflow: 'hidden',
                borderCollapse: 'separate',
                boxShadow: `6px 6px 0 ${c.ink}`,
              }}
            >
              <Header t={t} />
              <Stripe
                height={14}
                background={c.leaf}
                border={{ borderTop: `2px solid ${c.ink}` }}
              />
              <Stripe
                height={10}
                background={c.grass}
                border={{ borderBottom: `2px solid ${c.ink}` }}
              />
              <Content t={t} heading={heading} cta={cta}>
                {children}
              </Content>
              <Note t={t} note={note} settingsUrl={settingsUrl} />
            </Container>
            <Text style={{ ...smallText, margin: '18px 0 0', fontSize: 12, color: c.inkSoft }}>
              {t('layout.footer')}
            </Text>
          </Column>
        </Row>
      </Body>
    </Html>
  );
}
