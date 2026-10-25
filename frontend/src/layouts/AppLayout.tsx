import { clsx } from 'clsx';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ListChecks,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  Users,
} from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router';

import { NotificationBell } from '../features/notifications/NotificationBell';
import { useLogout, useResendVerification, useSession } from '../shared/api/auth';
import { useGroups } from '../shared/api/groups';
import { useConnectCalendar, useSettings } from '../shared/api/settings';
import { getLastGroupId } from '../shared/lib/lastGroup';
import { Avatar } from '../shared/ui/Avatar';
import { Banner } from '../shared/ui/Banner';
import { Button } from '../shared/ui/Button';
import { Logo } from '../shared/ui/Logo';
import { Menu, MenuItem, MenuSeparator, type MenuTriggerProps } from '../shared/ui/Menu';
import { useToast } from '../shared/ui/Toast';
import styles from './AppLayout.module.css';

const sections = [
  { path: 'tasks', icon: ListChecks, label: 'nav.tasks' },
  { path: 'calendar', icon: CalendarDays, label: 'nav.calendar' },
  { path: 'members', icon: Users, label: 'nav.group' },
  { path: 'stats', icon: BarChart3, label: 'nav.stats' },
] as const;

/**
 * Група для навігації в шапці: з адреси, інакше остання відкрита, інакше перша.
 * Без запасного варіанту на /settings чи /home одразу після входу пропадали «Задачі», «Календар»…
 */
function useActiveGroupId(): string | null {
  const match = useMatch('/g/:groupId/*');
  const { data: groups } = useGroups();
  const candidate = match?.params.groupId ?? getLastGroupId();
  if (
    candidate !== null &&
    candidate !== '' &&
    (!groups || groups.some((group) => group.id === candidate))
  ) {
    return candidate;
  }
  return groups?.[0]?.id ?? null;
}

/** Кнопка-перемикач груп у шапці */
function groupSwitcherTrigger(label: string, name: string) {
  return function GroupSwitcherTrigger(props: MenuTriggerProps): JSX.Element {
    return (
      <button type="button" className={styles.switcher} aria-label={label} {...props}>
        <span className={styles.switcherName}>{name}</span>
        <ChevronDown size={16} />
      </button>
    );
  };
}

/** Кнопка з аватаркою, що відкриває меню користувача */
function userMenuTrigger(label: string, user: { name: string; avatarUrl: string | null }) {
  return function UserMenuTrigger(props: MenuTriggerProps): JSX.Element {
    return (
      <button type="button" className={styles.userButton} aria-label={label} {...props}>
        <Avatar name={user.name} src={user.avatarUrl} color="var(--lime)" size={38} />
      </button>
    );
  };
}

function GroupSwitcher({ activeId }: { activeId: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: groups } = useGroups();
  const active = groups?.find((group) => group.id === activeId);

  if (groups === undefined || groups.length === 0) return null;

  return (
    <Menu trigger={groupSwitcherTrigger(t('nav.switchGroup'), active?.name ?? t('nav.groups'))}>
      {(close) => (
        <>
          {groups.map((group) => (
            <MenuItem
              key={group.id}
              active={group.id === activeId}
              icon={
                group.id === activeId ? <Check size={16} /> : <span className={styles.menuDot} />
              }
              onSelect={() => {
                close();
                void navigate(`/g/${group.id}/tasks`);
              }}
            >
              {group.name}
              <span className={styles.menuMeta}>
                {t('groups.membersCount', { count: group.memberCount })} ·{' '}
                {t(group.role === 'admin' ? 'common.admin' : 'common.member')}
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<Plus size={16} />}
            onSelect={() => {
              close();
              void navigate('/groups/new');
            }}
          >
            {t('nav.newGroup')}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const logout = useLogout();

  if (!user) return null;

  return (
    <Menu align="end" trigger={userMenuTrigger(t('nav.menu'), user)}>
      {(close) => (
        <>
          <div className={styles.userInfo}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<Settings size={16} />}
            onSelect={() => {
              close();
              void navigate('/settings');
            }}
          >
            {t('nav.settings')}
          </MenuItem>
          <MenuItem
            danger
            icon={<LogOut size={16} />}
            onSelect={() => {
              close();
              logout.mutate(undefined, {
                onSuccess: () => {
                  void navigate('/login');
                },
              });
            }}
          >
            {t('nav.logout')}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

function StatusBanners() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: user } = useSession();
  const { data: settings } = useSettings();
  const resend = useResendVerification();
  const connect = useConnectCalendar();

  return (
    <>
      {user && !user.emailVerified && (
        <Banner
          tone="info"
          icon={<Mail size={18} />}
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={resend.isPending}
              onClick={() =>
                resend.mutate(undefined, {
                  onSuccess: () => toast(t('auth.verifyResent')),
                })
              }
            >
              {t('auth.verifyResend')}
            </Button>
          }
        >
          {t('auth.verifyBanner')}
        </Banner>
      )}
      {settings?.calendar.connected === true && settings.calendar.syncStatus === 'paused' && (
        <Banner
          tone="warning"
          icon={<RefreshCw size={18} />}
          action={
            <Button size="sm" loading={connect.isPending} onClick={() => connect.mutate()}>
              {t('calendarSync.reconnect')}
            </Button>
          }
        >
          <strong>{t('calendarSync.paused')}.</strong> {t('calendarSync.pausedText')}
        </Banner>
      )}
    </>
  );
}

export function AppLayout(): JSX.Element {
  const { t } = useTranslation();
  const groupId = useActiveGroupId();
  const { data: groups } = useGroups();
  const hasGroup =
    groupId !== null && groupId !== '' && groups?.some((group) => group.id === groupId) === true;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/home" className={styles.logo} aria-label="Errandly">
            <Logo size={20} />
          </Link>
          <GroupSwitcher activeId={hasGroup ? groupId : null} />
          {hasGroup && (
            <nav className={styles.nav} aria-label={t('nav.groups')}>
              {sections.map(({ path, icon: Icon, label }) => (
                <NavLink
                  key={path}
                  to={`/g/${groupId}/${path}`}
                  className={({ isActive }) => clsx(styles.navLink, isActive && styles.navActive)}
                >
                  <Icon size={16} />
                  {t(label)}
                </NavLink>
              ))}
            </nav>
          )}
          <div className={styles.spacer} />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      <div className={styles.banners}>
        <StatusBanners />
      </div>

      <main className={styles.main}>
        <Outlet />
      </main>

      {hasGroup && (
        <nav className={styles.bottomNav} aria-label={t('nav.groups')}>
          {sections.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={`/g/${groupId}/${path}`}
              className={({ isActive }) => clsx(styles.bottomLink, isActive && styles.bottomActive)}
            >
              <span className={styles.bottomIcon}>
                <Icon size={20} />
              </span>
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
