import { clsx } from 'clsx';
import {
  addDays,
  addMonths,
  addWeeks,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
} from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Plane, Plus } from 'lucide-react';
import { useMemo, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../shared/api/errors';
import { useTasks } from '../../shared/api/tasks';
import type { Member, Task, TaskStatus } from '../../shared/api/types';
import {
  daysBetween,
  formatDate,
  formatShortDate,
  formatTime,
  monthGridRange,
  toDateInputValue,
  weekRange,
} from '../../shared/lib/dates';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Segmented } from '../../shared/ui/Segmented';
import { Spinner } from '../../shared/ui/Spinner';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { useTaskActions } from '../tasks/taskActionsContext';
import { TaskQuickMenu } from '../tasks/TaskQuickMenu';
import { toStringList } from '../tasks/translationList';
import styles from './CalendarPage.module.css';

type View = 'week' | 'month';
const MONTH_CELL_LIMIT = 3;

// для запланованих окремого стилю немає
const statusClass: Record<TaskStatus, string | undefined> = {
  planned: undefined,
  done: styles.done,
  overdue: styles.overdue,
  unassigned: styles.unassigned,
};

function TaskChip({
  task,
  color,
  compact,
}: {
  task: Task;
  color: string;
  compact?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const { membersById } = useCurrentGroup();
  const assignee = task.assigneeId === null ? undefined : membersById.get(task.assigneeId);
  const label = `${formatTime(task.dueAt)} ${task.title} — ${assignee?.name ?? t('tasks.nobody')} (${t(`tasks.status.${task.status}`)})`;

  return (
    <li className={styles.chipItem}>
      <TaskQuickMenu task={task}>
        {(props) => (
          <button
            type="button"
            className={clsx(
              styles.chip,
              compact === true && styles.chipCompact,
              statusClass[task.status],
            )}
            style={{
              background: task.status === 'unassigned' ? undefined : color,
            }}
            title={label}
            {...props}
          >
            <span className="visually-hidden">{label}</span>
            <span aria-hidden className={styles.chipTime}>
              {formatTime(task.dueAt)}
            </span>
            <span aria-hidden className={styles.chipTitle}>
              {task.title}
            </span>
            {task.status === 'done' && <Check aria-hidden size={14} strokeWidth={3} />}
          </button>
        )}
      </TaskQuickMenu>
    </li>
  );
}

function awayOn(
  members: Member[],
  day: Date,
): { member: Member; absence: Member['absences'][number] }[] {
  const date = toDateInputValue(day);
  return members.flatMap((member) => {
    const absence = member.absences.find((item) => item.from <= date && date <= item.to);
    return absence ? [{ member, absence }] : [];
  });
}

/** Хто не вдома цього дня (FR-17): у цей час задачі їм не призначаються */
function AwayList({
  members,
  day,
  compact = false,
}: {
  members: Member[];
  day: Date;
  compact?: boolean;
}): JSX.Element | null {
  const { t } = useTranslation();
  const away = awayOn(members, day);
  if (away.length === 0) return null;

  return (
    <ul className={clsx(styles.away, compact && styles.awayCompact)}>
      {away.map(({ member, absence }) => {
        const label = t('calendar.awayLabel', {
          name: member.name,
          from: formatShortDate(absence.from),
          to: formatShortDate(absence.to),
        });
        return (
          <li
            key={member.userId}
            className={styles.awayItem}
            style={{ ['--member-color' as string]: member.color }}
            title={label}
          >
            <span className="visually-hidden">{label}</span>
            <Avatar
              name={member.name}
              src={member.avatarUrl}
              color={member.color}
              size={compact ? 18 : 20}
            />
            {!compact && <span aria-hidden>{member.name.split(' ')[0]}</span>}
            <Plane aria-hidden size={13} />
          </li>
        );
      })}
    </ul>
  );
}

/** Адміністратор може додати задачу на конкретний день (минулі дні — ні) */
function AddDayButton({
  day,
  todayStart,
  compact = false,
}: {
  day: Date;
  todayStart: Date;
  compact?: boolean;
}): JSX.Element | null {
  const { t } = useTranslation();
  const { isAdmin } = useCurrentGroup();
  const actions = useTaskActions();
  return isAdmin && day >= todayStart ? (
    <button
      type="button"
      className={clsx(styles.addDay, compact && styles.addDayCompact)}
      onClick={() => actions.create(day)}
      aria-label={t('calendar.addOn', { date: formatDate(day, 'd MMMM') })}
      title={t('calendar.addOn', { date: formatDate(day, 'd MMMM') })}
    >
      <Plus size={compact ? 14 : 16} />
    </button>
  ) : null;
}

/** Колір задачі — колір виконавця; без виконавця — нейтральний */
function useTaskColor(): (task: Task) => string {
  const { membersById } = useCurrentGroup();
  return (task) => {
    const color = task.assigneeId === null ? undefined : membersById.get(task.assigneeId)?.color;
    return color === undefined || color === '' ? 'var(--cream-deep)' : color;
  };
}

interface DaysViewProps {
  days: Date[];
  todayStart: Date;
  tasksOn: (day: Date) => Task[];
}

function WeekView({ days, todayStart, tasksOn }: DaysViewProps): JSX.Element {
  const { t } = useTranslation();
  const { group } = useCurrentGroup();
  const colorOf = useTaskColor();
  return (
    <div className={styles.week}>
      {days.map((day) => (
        <section
          key={day.toISOString()}
          className={clsx(styles.weekDay, isToday(day) && styles.today)}
          data-today-label={isToday(day) ? t('common.today') : undefined}
        >
          <h3 className={styles.weekDayHead}>
            <span>{formatDate(day, 'EEEEEE')}</span>
            <span className={styles.headRight}>
              <span className={styles.dayNumber}>{formatDate(day, 'd')}</span>
              <AddDayButton day={day} todayStart={todayStart} />
            </span>
          </h3>
          <div className={styles.dayBody}>
            <AwayList members={group.members} day={day} />
            <ul className={styles.chips}>
              {tasksOn(day).map((task) => (
                <TaskChip key={task.id} task={task} color={colorOf(task)} />
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

function MonthCell({
  day,
  anchor,
  todayStart,
  dayTasks,
  onOpenWeek,
}: {
  day: Date;
  anchor: Date;
  todayStart: Date;
  dayTasks: Task[];
  onOpenWeek: (day: Date) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { group } = useCurrentGroup();
  const colorOf = useTaskColor();
  return (
    <section
      className={clsx(
        styles.monthCell,
        !isSameMonth(day, anchor) && styles.outside,
        isToday(day) && styles.today,
      )}
      aria-label={formatDate(day, 'd MMMM')}
    >
      <button
        type="button"
        className={styles.monthNumber}
        onClick={() => onOpenWeek(day)}
        aria-label={t('calendar.openWeek', {
          date: formatDate(day, 'd MMMM'),
        })}
      >
        {formatDate(day, 'd')}
      </button>
      <AddDayButton day={day} todayStart={todayStart} compact />
      <AwayList members={group.members} day={day} compact />
      <ul className={styles.chips}>
        {dayTasks.slice(0, MONTH_CELL_LIMIT).map((task) => (
          <TaskChip key={task.id} task={task} color={colorOf(task)} compact />
        ))}
      </ul>
      {dayTasks.length > MONTH_CELL_LIMIT && (
        <span className={styles.more}>
          {t('calendar.more', {
            count: dayTasks.length - MONTH_CELL_LIMIT,
          })}
        </span>
      )}
      {dayTasks.length > 0 && (
        <span className={styles.dots} aria-hidden>
          {dayTasks.slice(0, 6).map((task) => (
            <span key={task.id} className={styles.dot} style={{ background: colorOf(task) }} />
          ))}
        </span>
      )}
    </section>
  );
}

function MonthView({
  days,
  anchor,
  todayStart,
  tasksOn,
  onOpenWeek,
}: DaysViewProps & { anchor: Date; onOpenWeek: (day: Date) => void }): JSX.Element {
  const { t } = useTranslation();
  const weekdayNames = toStringList(t('weekdays.short', { returnObjects: true }));
  return (
    <div className={styles.month}>
      {weekdayNames.map((name) => (
        <div key={name} className={styles.monthHead}>
          {name}
        </div>
      ))}
      {days.map((day) => (
        <MonthCell
          key={day.toISOString()}
          day={day}
          anchor={anchor}
          todayStart={todayStart}
          dayTasks={tasksOn(day)}
          onOpenWeek={onOpenWeek}
        />
      ))}
    </div>
  );
}

function CalendarToolbar({
  title,
  loading,
  onShift,
  onToday,
}: {
  title: string;
  loading: boolean;
  onShift: (direction: 1 | -1) => void;
  onToday: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.toolbar}>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => onShift(-1)}
          aria-label={t('calendar.prev')}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => onShift(1)}
          aria-label={t('calendar.next')}
        >
          <ChevronRight size={20} />
        </button>
        <Button size="sm" variant="secondary" onClick={onToday}>
          {t('calendar.today')}
        </Button>
      </div>
      <h2 className={styles.period} aria-live="polite">
        {title}
        {loading && <Spinner size={16} />}
      </h2>
    </div>
  );
}

function CalendarLegend({ members }: { members: Member[] }): JSX.Element {
  const { t } = useTranslation();
  return (
    <ul className={styles.legend} aria-label={t('calendar.legend')}>
      {members.map((member) => (
        <li key={member.userId} className={styles.legendItem}>
          <Avatar name={member.name} src={member.avatarUrl} color={member.color} size={22} />
          {member.name.split(' ')[0]}
        </li>
      ))}
      <li className={clsx(styles.legendItem, styles.legendAway)}>
        <Plane size={14} />
        {t('calendar.away')}
      </li>
    </ul>
  );
}

/** Календарний вигляд задач групи; кожен виконавець — своїм кольором (FR-37) */
export function CalendarPage(): JSX.Element {
  const { t } = useTranslation();
  const { group } = useCurrentGroup();
  const [todayStart] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());

  const range = useMemo(
    () => (view === 'week' ? weekRange(anchor) : monthGridRange(anchor)),
    [view, anchor],
  );
  const days = useMemo(() => daysBetween(range.from, range.to), [range]);
  const {
    data: tasks,
    isPending,
    error,
    refetch,
  } = useTasks(group.id, range.from.toISOString(), range.to.toISOString());

  const tasksOn = (day: Date): Task[] =>
    (tasks ?? []).filter((task) => isSameDay(new Date(task.dueAt), day));

  const shift = (direction: 1 | -1): void =>
    setAnchor((current) =>
      view === 'week' ? addWeeks(current, direction) : addMonths(current, direction),
    );

  // тиждень — рівно 7 днів від range.from
  const title =
    view === 'week'
      ? `${formatDate(range.from, 'd MMM')} — ${formatDate(addDays(range.from, 6), 'd MMM yyyy')}`
      : formatDate(anchor, 'LLLL yyyy');

  return (
    <>
      <PageHeader
        title={t('calendar.title')}
        actions={
          <Segmented
            label={t('calendar.view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'week', label: t('calendar.week') },
              { value: 'month', label: t('calendar.month') },
            ]}
          />
        }
      />

      <CalendarToolbar
        title={title}
        loading={isPending}
        onShift={shift}
        onToday={() => setAnchor(new Date())}
      />

      <CalendarLegend members={group.members} />

      {error ? (
        <EmptyState
          title={errorMessage(error, t)}
          action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
        />
      ) : view === 'week' ? (
        <WeekView days={days} todayStart={todayStart} tasksOn={tasksOn} />
      ) : (
        <MonthView
          days={days}
          anchor={anchor}
          todayStart={todayStart}
          tasksOn={tasksOn}
          onOpenWeek={(day) => {
            setAnchor(day);
            setView('week');
          }}
        />
      )}
    </>
  );
}
