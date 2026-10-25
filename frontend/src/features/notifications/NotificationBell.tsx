import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CheckCheck,
  ListChecks,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type JSX, type RefObject } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useMarkNotificationsRead, useNotifications } from '../../shared/api/notifications';
import type { AppNotification, NotificationType } from '../../shared/api/types';
import { handleMenuKeys } from '../../shared/lib/menuKeys';
import { FlowerFace } from '../../shared/ui/Decor';
import styles from './NotificationBell.module.css';

const ICONS: Record<NotificationType, { icon: typeof Bell; tone: string }> = {
  groupCreated: { icon: Sparkles, tone: 'var(--lime)' },
  groupJoined: { icon: UserPlus, tone: 'var(--lime)' },
  memberJoined: { icon: UserPlus, tone: 'var(--sky)' },
  taskAssigned: { icon: ListChecks, tone: 'var(--sky)' },
  taskUnassigned: { icon: ArrowRightLeft, tone: 'var(--cream-deep)' },
  taskOverdue: { icon: AlertTriangle, tone: 'var(--status-overdue)' },
  roleGranted: { icon: ShieldCheck, tone: 'var(--lime)' },
  roleRevoked: { icon: ShieldOff, tone: 'var(--cream-deep)' },
  removedFromGroup: { icon: UserMinus, tone: 'var(--status-overdue)' },
};

function isPresent(value: string | null): value is string {
  return value !== null && value !== '';
}

function linkFor(item: AppNotification): string {
  if (isPresent(item.groupId) && isPresent(item.taskId)) {
    return `/g/${item.groupId}/tasks/${item.taskId}`;
  }
  if (isPresent(item.groupId)) return `/g/${item.groupId}/tasks`;
  return '/home';
}

/** Закриває панель кліком поза нею або клавішею Escape */
function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || ref.current?.contains(target) !== true) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, setOpen]);
}

function NotificationItem({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { icon: Icon, tone } = ICONS[item.type];

  return (
    <li>
      <button
        type="button"
        role="menuitem"
        className={clsx(styles.item, !item.read && styles.unread)}
        onClick={() => onOpen(item)}
      >
        <span className={styles.icon} style={{ background: tone }}>
          <Icon size={16} />
        </span>
        <span className={styles.text}>
          <span>
            <Trans
              i18nKey={`notifications.types.${item.type}`}
              values={{
                group: item.data.groupName ?? '',
                task: item.data.taskTitle ?? '',
                actor: item.data.actorName ?? '',
              }}
              components={{ b: <strong /> }}
            />
          </span>
          <time className={styles.time} dateTime={item.createdAt}>
            {formatDistanceToNow(new Date(item.createdAt), {
              locale: uk,
              addSuffix: true,
            })}
          </time>
        </span>
        {!item.read && (
          <span className={styles.dot}>
            <span className="visually-hidden">{t('notifications.new')}</span>
          </span>
        )}
      </button>
    </li>
  );
}

export function NotificationBell(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const unread = data?.unread ?? 0;

  useDismiss(open, ref, setOpen);

  const openItem = (item: AppNotification) => {
    if (!item.read) markRead.mutate([item.id]);
    setOpen(false);
    void navigate(linkFor(item));
  };

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        type="button"
        className={clsx(styles.bell, unread > 0 && styles.bellActive)}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        aria-label={
          unread > 0 ? t('notifications.labelUnread', { count: unread }) : t('notifications.label')
        }
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className={styles.badge} aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className={styles.panel}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleMenuKeys}
        >
          <div className={styles.head}>
            <h2 className={styles.title}>{t('notifications.title')}</h2>
            {unread > 0 && (
              <button
                type="button"
                role="menuitem"
                className={styles.readAll}
                onClick={() => markRead.mutate(undefined)}
              >
                <CheckCheck size={15} />
                {t('notifications.readAll')}
              </button>
            )}
          </div>

          {data && data.items.length === 0 ? (
            <div className={styles.empty}>
              <FlowerFace size={56} color="var(--lime)" />
              <p>{t('notifications.empty')}</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {data?.items.map((item) => (
                <NotificationItem key={item.id} item={item} onOpen={openItem} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
