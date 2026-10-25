import { clsx } from 'clsx';
import { ArrowRight, Check, Clock, Pencil, Trash2, Undo2, UserRoundCog } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import type { Member, Task } from '../../shared/api/types';
import { formatDate, formatTime } from '../../shared/lib/dates';
import { handleMenuKeys } from '../../shared/lib/menuKeys';
import { Avatar } from '../../shared/ui/Avatar';
import { Pill } from '../../shared/ui/Pill';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { useTaskActions } from './taskActionsContext';
import styles from './TaskQuickMenu.module.css';
import { canToggleTask, useToggleTask } from './useToggleTask';

const GAP = 8;
const EDGE = 12;

export interface QuickMenuTriggerProps {
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string;
}

interface TaskQuickMenuProps {
  task: Task;
  children: (props: QuickMenuTriggerProps) => ReactNode;
}

/** Позиціонування меню біля тригера з урахуванням країв екрана */
function placeMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  point: { x: number; y: number } | null,
): void {
  const { offsetWidth: width, offsetHeight: height } = menu;
  let left: number;
  let top: number;
  if (point) {
    // мишею/пальцем — відкриваємо біля точки кліку; біля краю розвертаємо вліво/вгору
    left = point.x + GAP;
    if (left + width > window.innerWidth - EDGE) left = point.x - width - GAP;
    top = point.y + GAP;
    if (top + height > window.innerHeight - EDGE) top = point.y - height - GAP;
  } else {
    // з клавіатури — під «⋯» (або під лівим краєм чипа в календарі)
    const hint = trigger.querySelector<HTMLElement>('[data-menu-anchor]');
    const anchor = (hint ?? trigger).getBoundingClientRect();
    left = hint ? anchor.right - width : anchor.left;
    top = anchor.bottom + GAP;
    if (top + height > window.innerHeight - EDGE) top = anchor.top - height - GAP;
  }
  left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
  top = Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function QuickMenuHead({
  task,
  assignee,
  isMine,
}: {
  task: Task;
  assignee: Member | undefined;
  isMine: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.head}>
      <div className={styles.title}>{task.title}</div>
      <div className={styles.meta}>
        <span>
          <Clock size={13} />
          {formatDate(new Date(task.dueAt), 'd MMM')}, {formatTime(task.dueAt)}
        </span>
        {assignee ? (
          <span>
            <Avatar
              name={assignee.name}
              src={assignee.avatarUrl}
              color={assignee.color}
              size={18}
            />
            {isMine ? t('common.you') : assignee.name.split(' ')[0]}
          </span>
        ) : (
          <span>{t('tasks.nobody')}</span>
        )}
        <Pill tone={task.status}>{t(`tasks.status.${task.status}`)}</Pill>
      </div>
    </div>
  );
}

interface QuickMenuItemsProps {
  task: Task;
  canToggle: boolean;
  isAdmin: boolean;
  /** Мутація живе в TaskQuickMenu: меню після кліку розмонтовується, а тост має дочекатися відповіді */
  toggle: (task: Task) => void;
  /** Закриває меню й виконує дію */
  run: (action: () => void) => () => void;
}

function QuickMenuItems({
  task,
  canToggle,
  isAdmin,
  toggle,
  run,
}: QuickMenuItemsProps): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { group } = useCurrentGroup();
  const actions = useTaskActions();
  const done = task.status === 'done';

  return (
    <div className={styles.items}>
      {canToggle && (
        <button
          type="button"
          role="menuitem"
          className={clsx(styles.item, !done && styles.primary)}
          onClick={run(() => toggle(task))}
        >
          {done ? <Undo2 size={17} /> : <Check size={17} />}
          {done ? t('taskPage.undo') : t('taskPage.markDone')}
        </button>
      )}
      {isAdmin && !done && (
        <button
          type="button"
          role="menuitem"
          className={styles.item}
          onClick={run(() => actions.reassign(task))}
        >
          <UserRoundCog size={17} />
          {t('tasks.reassign')}
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          role="menuitem"
          className={styles.item}
          onClick={run(() => actions.edit(task))}
        >
          <Pencil size={17} />
          {t('tasks.edit')}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={clsx(styles.item, styles.details)}
        onClick={run(() => {
          void navigate(`/g/${group.id}/tasks/${task.id}`, {
            state: { from: location.pathname + location.search },
          });
        })}
      >
        <ArrowRight size={17} />
        {t('tasks.details')}
      </button>
      {isAdmin && (
        <button
          type="button"
          role="menuitem"
          className={clsx(styles.item, styles.danger)}
          onClick={run(() => actions.remove(task))}
        >
          <Trash2 size={17} />
          {t('common.delete')}
        </button>
      )}
    </div>
  );
}

/**
 * Швидке меню задачі: клік по картці (у списку чи календарі) → основні дії,
 * а сторінка з деталями — окремим пунктом. Popover живе в top layer,
 * тож його не обрізають контейнери з overflow: hidden.
 */
export function TaskQuickMenu({ task, children }: TaskQuickMenuProps): JSX.Element {
  const navigate = useNavigate();
  const { group, me, isAdmin, membersById } = useCurrentGroup();
  const { toggle } = useToggleTask(group.id);
  const id = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closedAt = useRef(0);
  const clickPoint = useRef<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);

  const assignee = task.assigneeId === null ? undefined : membersById.get(task.assigneeId);
  const isMine = task.assigneeId === me.id;
  const canToggle = canToggleTask(task, { isMine, isAdmin });

  const run = (action: () => void) => () => {
    menuRef.current?.hidePopover();
    action();
  };

  const onTriggerClick = (event: React.MouseEvent<HTMLElement>): void => {
    const menu = menuRef.current;
    if (!menu || typeof menu.showPopover !== 'function') {
      void navigate(`/g/${group.id}/tasks/${task.id}`);
      return;
    }
    // клік по тригеру відкритого меню: light dismiss уже закрив його на pointerdown
    // oxlint-disable-next-line react/purity -- обробник події, не рендер
    if (performance.now() - closedAt.current < 250) return;
    triggerRef.current = event.currentTarget;
    // detail === 0 — активація з клавіатури: координат кліку немає
    clickPoint.current = event.detail > 0 ? { x: event.clientX, y: event.clientY } : null;
    setOpen(true);
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!open || !menu || !trigger) return;
    // показуємо вже з вмістом і одразу ставимо на місце — без кадру в центрі екрана
    if (!menu.matches(':popover-open')) menu.showPopover();
    placeMenu(menu, trigger, clickPoint.current);
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    // ref-и стабільні, тож у залежностях вони нічого не змінюють; потрібні лінтеру,
    // бо обробник із ref-ами передається в render-prop
  }, [open, menuRef, triggerRef, clickPoint]);

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = (): void => menuRef.current?.hidePopover();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, menuRef]);

  const onToggle = (event: React.ToggleEvent<HTMLDivElement>): void => {
    if (event.newState !== 'closed') return;
    setOpen(false);
    closedAt.current = performance.now();
    if (
      menuRef.current?.contains(document.activeElement) === true ||
      document.activeElement === document.body
    ) {
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      {/* oxlint-disable-next-line react/refs -- ref читається лише в обробнику кліку */}
      {children({
        onClick: onTriggerClick,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
      })}
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- фокус керований: при відкритті переходить на перший пункт меню (WAI-ARIA menu) */}
      <div
        id={id}
        ref={menuRef}
        popover="auto"
        role="menu"
        aria-label={task.title}
        className={styles.menu}
        onKeyDown={handleMenuKeys}
        onToggle={onToggle}
      >
        {open && (
          <>
            <QuickMenuHead task={task} assignee={assignee} isMine={isMine} />
            <QuickMenuItems
              task={task}
              canToggle={canToggle}
              isAdmin={isAdmin}
              toggle={toggle}
              run={run}
            />
          </>
        )}
      </div>
    </>
  );
}
