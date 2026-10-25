import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Bell,
  CalendarCheck2,
  CalendarX2,
  CircleCheck,
  KeyRound,
  Palette,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { useSession } from '../../shared/api/auth';
import { errorMessage, isApiError } from '../../shared/api/errors';
import { useGroups } from '../../shared/api/groups';
import {
  useChangePassword,
  useDeleteAccount,
  useSyncCalendar,
  useUpdateProfile,
} from '../../shared/api/profile';
import {
  useConnectCalendar,
  useDisconnectCalendar,
  useSettings,
  useUpdateSettings,
} from '../../shared/api/settings';
import type { Settings, User } from '../../shared/api/types';
import { setPrefs, usePrefs } from '../../shared/lib/prefs';
import { isValidPassword } from '../../shared/lib/validation';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Field, FormError, Input, Select } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pill } from '../../shared/ui/Pill';
import { Segmented } from '../../shared/ui/Segmented';
import { PageSpinner } from '../../shared/ui/Spinner';
import { Switch } from '../../shared/ui/Switch';
import { useToast } from '../../shared/ui/Toast';
import { PasswordInput } from '../auth/PasswordInput';
import { PasswordRules } from '../auth/PasswordRules';
import { AvatarEditor } from './AvatarEditor';
import styles from './SettingsPage.module.css';
import { ThemePicker } from './ThemePicker';
import { useActiveSection } from './useActiveSection';

const SECTIONS = [
  { id: 'profile', icon: UserIcon },
  { id: 'notifications', icon: Bell },
  { id: 'calendar', icon: CalendarCheck2 },
  { id: 'interface', icon: Palette },
  { id: 'groups', icon: Users },
  { id: 'privacy', icon: ShieldCheck },
] as const;

const SECTION_IDS = SECTIONS.map((section) => section.id);
const REMINDER_OPTIONS = [15, 30, 60, 180, 1440];
const TIMEZONES = [
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/Prague',
  'Europe/London',
  'Europe/Lisbon',
  'America/New_York',
  'America/Toronto',
  'Asia/Tokyo',
];
const NOTIFICATIONS = ['assigned', 'dueSoon', 'overdue', 'weeklyDigest'] as const;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card as="section" className={styles.section} aria-labelledby={`${id}-title`}>
      <span id={id} className={styles.anchor} />
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {description !== undefined && description !== '' && (
        <p className={styles.sectionText}>{description}</p>
      )}
      {children}
    </Card>
  );
}

function ProfileSection({ user }: { user: User }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [nameError, setNameError] = useState<string>();
  const changed = name.trim() !== user.name || timezone !== user.timezone;
  const zones = TIMEZONES.includes(user.timezone) ? TIMEZONES : [user.timezone, ...TIMEZONES];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return setNameError(t('auth.errors.nameRequired'));
    setNameError(undefined);
    update.mutate(
      { name: name.trim(), timezone },
      { onSuccess: () => toast(t('settings.profileSaved')) },
    );
  };

  return (
    <Section id="profile" title={t('settings.sections.profile')}>
      <AvatarEditor user={user}>
        <div>
          <div className={styles.name}>{user.name}</div>
          <div className={styles.email}>
            {user.email}
            {user.emailVerified ? (
              <Pill tone="done">
                <CircleCheck size={13} />
                {t('settings.verified')}
              </Pill>
            ) : (
              <Pill tone="overdue">{t('settings.notVerified')}</Pill>
            )}
          </div>
        </div>
      </AvatarEditor>

      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.row}>
          <Field label={t('auth.name')} error={nameError}>
            {(props) => (
              <Input
                {...props}
                maxLength={60}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('settings.timezoneLabel')} hint={t('settings.timezoneHint')}>
            {(props) => (
              <Select
                {...props}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {update.error && <FormError>{errorMessage(update.error, t)}</FormError>}
        <div className={styles.actions}>
          <Button type="submit" disabled={!changed} loading={update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>

      <PasswordForm />
    </Section>
  );
}

function PasswordForm(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const change = useChangePassword();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!open) {
    return (
      <div className={styles.subBlock}>
        <Button variant="secondary" icon={<KeyRound size={16} />} onClick={() => setOpen(true)}>
          {t('settings.changePassword')}
        </Button>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (current === '' || !isValidPassword(next)) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast(t('settings.passwordChanged'));
          setOpen(false);
          setCurrent('');
          setNext('');
          setSubmitted(false);
        },
      },
    );
  };

  return (
    <form className={clsx(styles.form, styles.subBlock)} onSubmit={submit} noValidate>
      <h3 className={styles.subTitle}>{t('settings.changePassword')}</h3>
      {change.error && (
        <FormError>
          {isApiError(change.error, 'WRONG_PASSWORD')
            ? t('settings.wrongPassword')
            : errorMessage(change.error, t)}
        </FormError>
      )}
      <div className={styles.row}>
        <Field
          label={t('settings.currentPassword')}
          error={submitted && current === '' ? t('auth.errors.passwordRequired') : undefined}
        >
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('auth.newPassword')}
          error={submitted && !isValidPassword(next) ? t('auth.errors.passwordWeak') : undefined}
        >
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          )}
        </Field>
      </div>
      <PasswordRules password={next} showErrors={submitted} />
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={change.isPending}>
          {t('settings.savePassword')}
        </Button>
      </div>
    </form>
  );
}

function NotificationsSection({ settings, user }: { settings: Settings; user: User }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateSettings();

  return (
    <Section
      id="notifications"
      title={t('settings.sections.notifications')}
      description={t('settings.notificationsText', { email: user.email })}
    >
      <div className={styles.switches}>
        {NOTIFICATIONS.map((key) => (
          <Switch
            key={key}
            label={t(`settings.notify.${key}`)}
            description={t(`settings.notify.${key}Text`)}
            checked={settings.notifications[key]}
            disabled={update.isPending}
            onChange={(checked) =>
              update.mutate(
                {
                  notifications: { ...settings.notifications, [key]: checked },
                },
                {
                  onSuccess: () => toast(t('settings.saved')),
                  onError: (mutationError) => toast(errorMessage(mutationError, t), 'error'),
                },
              )
            }
          />
        ))}
      </div>
      <p className={styles.note}>
        <Bell size={15} />
        {t('settings.inAppNote')}
      </p>
    </Section>
  );
}

function CalendarStatus({ calendar }: { calendar: Settings['calendar'] }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const sync = useSyncCalendar();
  const paused = calendar.connected && calendar.syncStatus === 'paused';

  return (
    <div className={clsx(styles.calendarStatus, paused && styles.calendarPaused)}>
      {calendar.connected ? <CalendarCheck2 size={28} /> : <CalendarX2 size={28} />}
      <div className={styles.calendarInfo}>
        <strong>
          {calendar.connected
            ? t('settings.connected', { email: calendar.googleEmail ?? '' })
            : t('settings.notConnected')}
        </strong>
        {calendar.connected && (
          <span>
            {paused
              ? t('calendarSync.paused')
              : calendar.lastSyncedAt !== null && calendar.lastSyncedAt !== ''
                ? t('settings.lastSync', {
                    time: formatDistanceToNow(new Date(calendar.lastSyncedAt), {
                      locale: uk,
                      addSuffix: true,
                    }),
                  })
                : t('settings.neverSynced')}
          </span>
        )}
      </div>
      {calendar.connected && (
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={15} />}
          loading={sync.isPending}
          onClick={() =>
            sync.mutate(undefined, {
              onSuccess: () => toast(t('settings.synced')),
              onError: (syncError) => toast(errorMessage(syncError, t), 'error'),
            })
          }
        >
          {t('settings.syncNow')}
        </Button>
      )}
    </div>
  );
}

function CalendarSection({ settings }: { settings: Settings }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateSettings();
  const connect = useConnectCalendar();
  const disconnect = useDisconnectCalendar();
  const { calendar } = settings;

  return (
    <Section
      id="calendar"
      title={t('settings.sections.calendar')}
      description={t('settings.calendarText')}
    >
      <CalendarStatus calendar={calendar} />

      {calendar.connected ? (
        <>
          <div className={styles.row}>
            <Field label={t('settings.reminder')} hint={t('settings.reminderHint')}>
              {(props) => (
                <Select
                  {...props}
                  value={settings.reminderMinutes}
                  onChange={(event) =>
                    update.mutate(
                      { reminderMinutes: Number(event.target.value) },
                      { onSuccess: () => toast(t('settings.saved')) },
                    )
                  }
                >
                  {REMINDER_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {t(`settings.reminderOptions.${minutes}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className={styles.actions}>
            <Button
              variant="danger"
              loading={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => toast(t('settings.disconnected')),
                })
              }
            >
              {t('settings.disconnect')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className={styles.bullets}>
            <li>{t('settings.calendarPoint1')}</li>
            <li>{t('settings.calendarPoint2')}</li>
            <li>{t('settings.calendarPoint3')}</li>
          </ul>
          <div className={styles.actions}>
            <Button
              variant="lime"
              size="lg"
              loading={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {t('settings.connect')}
            </Button>
          </div>
        </>
      )}
      {(connect.error ?? disconnect.error) && (
        <FormError>{errorMessage(connect.error ?? disconnect.error, t)}</FormError>
      )}
    </Section>
  );
}

function InterfaceSection(): JSX.Element {
  const { t } = useTranslation();
  const prefs = usePrefs();

  return (
    <Section
      id="interface"
      title={t('settings.sections.interface')}
      description={t('settings.interfaceText')}
    >
      <div>
        <div className={styles.prefLabel}>{t('settings.theme')}</div>
        <p className={styles.prefText}>{t('settings.themeText')}</p>
      </div>
      <ThemePicker />
      <div className={styles.prefRow}>
        <div>
          <div className={styles.prefLabel}>{t('settings.defaultScope')}</div>
          <p className={styles.prefText}>{t('settings.defaultScopeText')}</p>
        </div>
        <Segmented
          label={t('settings.defaultScope')}
          value={prefs.defaultScope}
          onChange={(value) => setPrefs({ defaultScope: value })}
          options={[
            { value: 'mine', label: t('tasks.mine') },
            { value: 'all', label: t('tasks.all') },
          ]}
        />
      </div>
      <div className={styles.switches}>
        <Switch
          label={t('settings.reduceMotion')}
          description={t('settings.reduceMotionText')}
          checked={prefs.reduceMotion}
          onChange={(checked) => setPrefs({ reduceMotion: checked })}
        />
      </div>
      <div className={styles.row}>
        <Field label={t('settings.language')} hint={t('settings.languageHint')}>
          {(props) => (
            <Select {...props} value="uk" onChange={() => {}}>
              <option value="uk">Українська</option>
              <option value="en" disabled>
                English — {t('settings.soon')}
              </option>
            </Select>
          )}
        </Field>
      </div>
    </Section>
  );
}

function GroupsSection(): JSX.Element {
  const { t } = useTranslation();
  const { data: groups } = useGroups();

  return (
    <Section
      id="groups"
      title={t('settings.sections.groups')}
      description={t('settings.groupsText')}
    >
      <ul className={styles.groups}>
        {groups?.map((group) => (
          <li key={group.id} className={styles.groupRow}>
            <div className={styles.groupInfo}>
              <strong>{group.name}</strong>
              <span>{t('groups.membersCount', { count: group.memberCount })}</span>
            </div>
            <Pill tone={group.role === 'admin' ? 'lime' : 'cream'}>
              {t(group.role === 'admin' ? 'common.admin' : 'common.member')}
            </Pill>
            <Link to={`/g/${group.id}/members`} className={styles.groupLink}>
              {t('settings.manageGroup')}
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <ButtonLink to="/groups/new" variant="secondary">
          {t('nav.newGroup')}
        </ButtonLink>
      </div>
    </Section>
  );
}

/** Групи, де користувач — останній адміністратор (з тіла помилки LAST_ADMIN) */
function lastAdminGroups(error: unknown): string[] {
  if (!isApiError(error, 'LAST_ADMIN')) return [];
  const details: object = error.details;
  if (!('groups' in details) || !Array.isArray(details.groups)) return [];
  return details.groups.filter((group: unknown): group is string => typeof group === 'string');
}

function PrivacySection(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const blockingGroups = lastAdminGroups(remove.error);

  return (
    <Section id="privacy" title={t('settings.sections.privacy')}>
      <ul className={styles.bullets}>
        <li>{t('settings.privacyPoint1')}</li>
        <li>{t('settings.privacyPoint2')}</li>
        <li>{t('settings.privacyPoint3')}</li>
      </ul>

      <div className={styles.danger}>
        <div>
          <div className={styles.prefLabel}>{t('settings.deleteAccount')}</div>
          <p className={styles.prefText}>{t('settings.deleteAccountText')}</p>
        </div>
        <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirming(true)}>
          {t('settings.deleteAccount')}
        </Button>
      </div>

      <Modal
        size="sm"
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setAgreed(false);
          remove.reset();
        }}
        title={t('settings.deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={!agreed}
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => void navigate('/', { replace: true }),
                })
              }
            >
              {t('settings.deleteForever')}
            </Button>
          </>
        }
      >
        <p>{t('settings.deleteModalText')}</p>
        <label className={styles.agree}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          {t('settings.deleteAgree')}
        </label>
        {remove.error && (
          <FormError>
            {blockingGroups.length > 0
              ? t('settings.deleteLastAdmin', {
                  groups: blockingGroups.join(', '),
                })
              : errorMessage(remove.error, t)}
          </FormError>
        )}
      </Modal>
    </Section>
  );
}

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: user } = useSession();
  const { data: settings, isPending, error } = useSettings();
  const active = useActiveSection(SECTION_IDS, Boolean(settings && user));
  const navRef = useRef<HTMLElement>(null);

  const ready = Boolean(settings && user);
  const { hash } = useLocation();

  // за прямим посиланням (/settings#calendar) браузер шукає якір ще під час
  // завантаження — прокручуємо самі, коли розділи вже на сторінці
  useEffect(() => {
    if (!ready || hash === '') return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [ready, hash]);

  // на мобільному вкладки горизонтальні — тримаємо активну в полі зору
  useEffect(() => {
    if (active === undefined) return;
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: link.offsetLeft - 16, behavior: 'smooth' });
  }, [active]);

  // повернення з OAuth-згоди Google
  useEffect(() => {
    if (params.get('calendar') === 'connected') {
      toast(t('settings.connectedToast'));
      setParams({}, { replace: true });
    }
  }, [params, setParams, toast, t]);

  if (isPending || !user) return <PageSpinner label={t('common.loading')} />;
  if (error) return <FormError>{errorMessage(error, t)}</FormError>;

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className={styles.layout}>
        <nav ref={navRef} className={styles.nav} aria-label={t('settings.title')}>
          {SECTIONS.map(({ id, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={clsx(styles.navLink, active === id && styles.navActive)}
              aria-current={active === id ? 'true' : undefined}
            >
              <Icon size={16} />
              {t(`settings.sections.${id}`)}
            </a>
          ))}
        </nav>
        <div className={styles.sections}>
          <ProfileSection user={user} />
          <NotificationsSection settings={settings} user={user} />
          <CalendarSection settings={settings} />
          <InterfaceSection />
          <GroupsSection />
          <PrivacySection />
        </div>
      </div>
    </>
  );
}
