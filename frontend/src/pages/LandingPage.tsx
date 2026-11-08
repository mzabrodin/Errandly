import { ArrowRight, CalendarDays, Repeat, Scale, Users } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useSession } from '../shared/api/auth';
import type { User } from '../shared/api/types';
import { ButtonLink } from '../shared/ui/Button';
import { Asterisk, Clouds, Flower, FlowerFace, Hills, Marquee } from '../shared/ui/Decor';
import { LanguageSwitch } from '../shared/ui/LanguageSwitch';
import { Logo } from '../shared/ui/Logo';
import styles from './LandingPage.module.css';

const PACKETS = [
  { key: 'trash', color: 'var(--lime)', level: 2, repeat: 'twice', who: 'anya' },
  {
    key: 'dishes',
    color: 'var(--sky-deep)',
    level: 1,
    repeat: 'daily',
    who: 'bohdan',
  },
  {
    key: 'bath',
    color: 'var(--flower-alt)',
    level: 4,
    repeat: 'weekly',
    who: 'marta',
  },
  {
    key: 'plants',
    color: 'var(--flower-mint)',
    level: 1,
    repeat: 'twice',
    who: 'oleh',
  },
] as const;

const FEATURES = [
  { key: 'group', icon: Users },
  { key: 'tasks', icon: Repeat },
  { key: 'fair', icon: Scale },
  { key: 'calendar', icon: CalendarDays },
] as const;

/** Marquee lines from the translations (an array via returnObjects) */
function useMarqueeItems(): string[] {
  const { t } = useTranslation();
  const items: unknown = t('landing.marquee', { returnObjects: true });
  return Array.isArray(items)
    ? items.filter((item): item is string => typeof item === 'string')
    : [];
}

function Hero({ user }: { user: User | null | undefined }): JSX.Element {
  const { t } = useTranslation();
  return (
    <header className={styles.hero}>
      <Clouds />
      <Hills />
      <nav className={styles.nav}>
        <Link to="/" className={styles.navBrand}>
          <Logo size={18} />
        </Link>
        <div className={styles.navLinks}>
          <a href="#how" className={styles.navPill}>
            {t('landing.nav.how')}
          </a>
          {user ? (
            <Link to="/app" className={`${styles.navPill} ${styles.navPillDark}`}>
              {t('landing.nav.openApp')}
            </Link>
          ) : (
            <>
              <LanguageSwitch />
              <Link to="/login" className={styles.navPill}>
                {t('landing.nav.login')}
              </Link>
              <Link to="/register" className={`${styles.navPill} ${styles.navPillDark}`}>
                {t('landing.nav.start')}
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className={styles.heroContent}>
        <h1 className={styles.heroTitle}>
          errandly
          <Asterisk className={styles.heroStar} size={88} color="var(--lime)" />
        </h1>
        <p className={styles.heroSub}>{t('landing.heroSub')}</p>
      </div>
      <Flower className={styles.heroFlower} size={120} color="var(--ink)" />
    </header>
  );
}

function PacketsSection(): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={`${styles.packets} grid-paper`}>
      <div className={styles.inner}>
        <span className={styles.label}>{t('landing.packetsTitle')}</span>
        <p className={styles.lead}>{t('landing.packetsText')}</p>
        <ul className={styles.packetList}>
          {PACKETS.map((packet) => (
            <li key={packet.key} className={styles.packet}>
              <div className={styles.packetCard}>
                <span className={styles.packetBrand}>errandly*</span>
                <span className={styles.packetTitle}>{t(`landing.packets.${packet.key}`)}</span>
                <FlowerFace className={styles.flowerFace} color={packet.color} />
              </div>
              <span className={styles.packetMeta}>
                {t('landing.packetMeta', {
                  level: packet.level,
                  repeat: t(`landing.repeat.${packet.repeat}`),
                })}
              </span>
              <span className={styles.packetWho}>→ {t(`landing.people.${packet.who}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowSection(): JSX.Element {
  const { t } = useTranslation();
  return (
    <section id="how" className={styles.how}>
      <div className={styles.inner}>
        <h2 className={styles.sectionTitle}>{t('landing.featuresTitle')}</h2>
        <ol className={styles.steps}>
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className={styles.step}>
              <span className={styles.stepPill}>{t(`landing.features.${key}Title`)}</span>
              <p className={styles.stepText}>{t(`landing.features.${key}Text`)}</p>
              <span className={styles.stepIcon}>
                <Icon size={26} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CtaSection({ user }: { user: User | null | undefined }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={styles.cta}>
      <div className={`${styles.inner} ${styles.ctaInner}`}>
        <div className={styles.preview} aria-hidden>
          <div className={styles.previewCard} style={{ rotate: '-4deg' }}>
            <span className={styles.previewCheck} />
            <span>
              <strong>{t('landing.packets.trash')}</strong>
              <small>{t('landing.demo.trash')}</small>
            </span>
          </div>
          <div className={styles.previewCard} style={{ rotate: '3deg', background: 'var(--lime)' }}>
            <span className={`${styles.previewCheck} ${styles.previewDone}`}>✓</span>
            <span>
              <strong>{t('landing.packets.dishes')}</strong>
              <small>{t('landing.demo.dishes')}</small>
            </span>
          </div>
          <div className={styles.previewCard} style={{ rotate: '-2deg', background: 'var(--sky)' }}>
            <span className={styles.previewCheck} />
            <span>
              <strong>{t('landing.packets.bath')}</strong>
              <small>{t('landing.demo.bath')}</small>
            </span>
          </div>
        </div>
        <div className={styles.ctaText}>
          <h2 className={styles.ctaTitle}>
            errandly<span className={styles.ctaStar}>*</span>
            <br />
            {t('landing.together')}
          </h2>
          <p className={styles.ctaLead}>{t('landing.ctaTitle')}</p>
          <p className={styles.muted}>{t('landing.ctaText')}</p>
          <ButtonLink to={user ? '/app' : '/register'} size="lg" icon={<ArrowRight size={18} />}>
            {user ? t('landing.nav.openApp') : t('landing.ctaButton')}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

export function LandingPage(): JSX.Element {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const marquee = useMarqueeItems();

  return (
    <div className={styles.page}>
      <Hero user={user} />

      <Marquee items={marquee} />

      <PacketsSection />

      <section className={styles.grass}>
        <div className={styles.cloudBlob}>
          <p>{t('landing.cloudText')}</p>
        </div>
      </section>

      <HowSection />

      <CtaSection user={user} />

      <footer className={styles.footer}>{t('landing.footer')}</footer>
    </div>
  );
}
