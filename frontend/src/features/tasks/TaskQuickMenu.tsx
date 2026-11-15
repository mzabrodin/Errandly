import { clsx } from 'clsx';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Clock,
  Pencil,
  Trash2,
  Undo2,
  UserRoundCog,
} from 'lucide-react';
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
import { taskPath } from '../../shared/lib/routes';
import { Pill } from '../../shared/ui/Pill';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { AssigneeLabel } from './AssigneeLabel';
import { canProposeSwap } from './swaps';
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

/** Positions the menu next to the trigger, respecting the screen edges */
function placeMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  point: { x: number; y: number } | null,
): void {
  const { offsetWidth: width, offsetHeight: height } = menu;
  let left: number;
  let top: number;
  if (point) {
    // Mouse/touch: open at the click point; near an edge, flip left/up
    left = point.x + GAP;
    if (left + width > window.innerWidth - EDGE) left = point.x - width - GAP;
    top = point.y + GAP;
    if (top + height > window.innerHeight - EDGE) top = point.y - height - GAP;
  } else {
    // Keyboard: below the "⋯" (or below the chip's left edge in the calendar)
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
          {formatDate(task.dueAt, 'd MMM')}, {formatTime(task.dueAt)}
        </span>
        {assignee ? (
          <span>
            <AssigneeLabel member={assignee} size={18} isMine={isMine} />
          </span>
        ) : (
          <span>{t('tasks.nobody')}</span>
        )}
        <Pill tone={task.status}>{t(`tasks.status.${task.status}`)}</Pill>
      </div>
    </div>
  );
}

function QuickItem({
  icon,
  label,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string | false | undefined;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={clsx(styles.item, className)}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

interface QuickMenuItemsProps {
  task: Task;
  canToggle: boolean;
  canSwap: boolean;
  isAdmin: boolean;
  /** The mutation lives in TaskQuickMenu: the menu unmounts after a click, but the toast must wait for the response */
  toggle: (task: Task) => void;
  /** Closes the menu and runs the action */
  run: (action: () => void) => () => void;
}

function QuickMenuItems({
  task,
  canToggle,
  canSwap,
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
        <QuickItem
          icon={done ? <Undo2 size={17} /> : <Check size={17} />}
          label={done ? t('taskPage.undo') : t('taskPage.markDone')}
          onClick={run(() => toggle(task))}
          className={!done && styles.primary}
        />
      )}
      {canSwap && (
        <QuickItem
          icon={<ArrowLeftRight size={17} />}
          label={t('swaps.propose')}
          onClick={run(() => actions.proposeSwap(task))}
        />
      )}
      {isAdmin && !done && (
        <QuickItem
          icon={<UserRoundCog size={17} />}
          label={t('tasks.reassign')}
          onClick={run(() => actions.reassign(task))}
        />
      )}
      {isAdmin && (
        <QuickItem
          icon={<Pencil size={17} />}
          label={t('tasks.edit')}
          onClick={run(() => actions.edit(task))}
        />
      )}
      <QuickItem
        icon={<ArrowRight size={17} />}
        label={t('tasks.details')}
        onClick={run(() => {
          void navigate(taskPath(group.id, task.id), {
            state: { from: location.pathname + location.search },
          });
        })}
        className={styles.details}
      />
      {isAdmin && (
        <QuickItem
          icon={<Trash2 size={17} />}
          label={t('common.delete')}
          onClick={run(() => actions.remove(task))}
          className={styles.danger}
        />
      )}
    </div>
  );
}

/**
 * Quick task menu: clicking a card (in the list or calendar) → main actions,
 * with the details page as a separate item. The popover lives in the top layer,
 * so containers with overflow: hidden do not clip it.
 */
export function TaskQuickMenu({ task, children }: TaskQuickMenuProps): JSX.Element {
  const navigate = useNavigate();
  const { group, me, isAdmin, memberOf } = useCurrentGroup();
  const { toggle } = useToggleTask(group.id);
  const id = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closedAt = useRef(0);
  const clickPoint = useRef<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);

  const assignee = memberOf(task.assigneeId);
  const isMine = task.assigneeId === me.id;
  const canToggle = canToggleTask(task, { isMine, isAdmin });

  const run = (action: () => void) => () => {
    menuRef.current?.hidePopover();
    action();
  };

  const onTriggerClick = (event: React.MouseEvent<HTMLElement>): void => {
    const menu = menuRef.current;
    if (!menu || typeof menu.showPopover !== 'function') {
      void navigate(taskPath(group.id, task.id));
      return;
    }
    // Click on the trigger of an open menu: light dismiss already closed it on pointerdown
    // oxlint-disable-next-line react/purity -- event handler, not render
    if (performance.now() - closedAt.current < 250) return;
    triggerRef.current = event.currentTarget;
    // detail === 0 means keyboard activation: there are no click coordinates
    clickPoint.current = event.detail > 0 ? { x: event.clientX, y: event.clientY } : null;
    setOpen(true);
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!open || !menu || !trigger) return;
    // Show it with content and position it at once, without a frame in the centre of the screen
    if (!menu.matches(':popover-open')) menu.showPopover();
    placeMenu(menu, trigger, clickPoint.current);
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    // Refs are stable, so they change nothing in the dependencies; the linter needs them
    // because the handler using the refs is passed to a render prop
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
      {/* oxlint-disable-next-line react/refs -- the ref is read only in the click handler */}
      {children({
        onClick: onTriggerClick,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
      })}
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- focus is managed: on open it moves to the first menu item (WAI-ARIA menu) */}
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
              canSwap={canProposeSwap(task, me.id)}
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
