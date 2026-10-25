import { clsx } from 'clsx';
import { addDays, startOfDay } from 'date-fns';
import { AlertTriangle, Plus } from 'lucide-react';
import { useMemo, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { errorMessage } from '../../shared/api/errors';
import { useTasks } from '../../shared/api/tasks';
import type { Task, TaskStatus } from '../../shared/api/types';
import { formatDate, formatDayLabel } from '../../shared/lib/dates';
import { usePrefs } from '../../shared/lib/prefs';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Segmented } from '../../shared/ui/Segmented';
import { PageSpinner } from '../../shared/ui/Spinner';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { arrangeTasks, type ArrangedTasks, type TaskScope } from './filterTasks';
import { Onboarding } from './Onboarding';
import { useTaskActions } from './taskActionsContext';
import { TaskCard } from './TaskCard';
import { TasksAside } from './TasksAside';
import styles from './TasksPage.module.css';
import { TodayHero } from './TodayHero';
import { useOnboardingVisible } from './useOnboardingVisible';
import { useToggleTask } from './useToggleTask';

const STATUSES: TaskStatus[] = ['planned', 'overdue', 'unassigned', 'done'];
const HISTORY_DAYS = 14;
const HORIZON_DAYS = 29;

function isTaskStatus(value: string | null): value is TaskStatus {
  return STATUSES.some((status) => status === value);
}

function useTaskRange(): { today: Date; from: string; to: string } {
  const [range] = useState(() => {
    const today = startOfDay(new Date());
    return {
      today,
      from: addDays(today, -HISTORY_DAYS).toISOString(),
      to: addDays(today, HORIZON_DAYS).toISOString(),
    };
  });
  return range;
}

/** Фільтри списку живуть у query-параметрах (scope, status) */
function useTaskFilters(): {
  scope: TaskScope;
  status: TaskStatus | null;
  defaultScope: TaskScope;
  setFilter: (key: 'scope' | 'status', value: string | null) => void;
  update: (change: (params: URLSearchParams) => void) => void;
} {
  const [params, setParams] = useSearchParams();
  const { defaultScope } = usePrefs();
  const scopeParam = params.get('scope');
  const scope: TaskScope =
    scopeParam === 'all' || scopeParam === 'mine' ? scopeParam : defaultScope;
  const statusParam = params.get('status');
  const status = isTaskStatus(statusParam) ? statusParam : null;

  const update = (change: (params: URLSearchParams) => void): void =>
    setParams(
      (current) => {
        change(current);
        return current;
      },
      { replace: true },
    );

  const setFilter = (key: 'scope' | 'status', value: string | null): void =>
    update((current) => {
      if (value === null) current.delete(key);
      else current.set(key, value);
    });

  return { scope, status, defaultScope, setFilter, update };
}

/** Прокрутка до блоку з підсвіткою; після зміни фільтрів блок з'являється не одразу — чекаємо кілька кадрів */
function scrollToSection(id: 'today' | 'overdue'): void {
  let attempts = 0;
  const scroll = (): void => {
    const section = document.getElementById(id);
    if (!section) {
      if (++attempts < 20) requestAnimationFrame(scroll);
      return;
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.dataset['flash'] = 'true';
    setTimeout(() => delete section.dataset['flash'], 1400);
  };
  requestAnimationFrame(scroll);
}

interface TaskListProps {
  items: Task[];
  toggle: (task: Task) => void;
  isToggling: (taskId: string) => boolean;
}

function TaskList({ items, toggle, isToggling }: TaskListProps): JSX.Element {
  const { me, isAdmin, membersById } = useCurrentGroup();
  return (
    <ul className={styles.list}>
      {items.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          assignee={task.assigneeId === null ? undefined : membersById.get(task.assigneeId)}
          isMine={task.assigneeId === me.id}
          isAdmin={isAdmin}
          pending={isToggling(task.id)}
          onToggle={() => toggle(task)}
        />
      ))}
    </ul>
  );
}

function TasksToolbar({
  scope,
  status,
  defaultScope,
  setFilter,
}: {
  scope: TaskScope;
  status: TaskStatus | null;
  defaultScope: TaskScope;
  setFilter: (key: 'scope' | 'status', value: string | null) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.toolbar}>
      <Segmented
        label={t('tasks.scope')}
        value={scope}
        onChange={(value) => setFilter('scope', value === defaultScope ? null : value)}
        options={[
          { value: 'mine', label: t('tasks.mine') },
          { value: 'all', label: t('tasks.all') },
        ]}
      />
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- група кнопок-фільтрів, fieldset змінив би розмітку й стилі */}
      <div className={styles.chips} role="group" aria-label={t('tasks.statusFilter')}>
        <button
          type="button"
          className={clsx(styles.chip, status === null && styles.chipOn)}
          aria-pressed={status === null}
          onClick={() => setFilter('status', null)}
        >
          {t('tasks.anyStatus')}
        </button>
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            className={clsx(
              styles.chip,
              styles[`chip-${value}`],
              status === value && styles.chipOn,
            )}
            aria-pressed={status === value}
            onClick={() => setFilter('status', status === value ? null : value)}
          >
            {t(`tasks.status.${value}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function TasksEmpty({
  scope,
  status,
  onShowAll,
}: {
  scope: TaskScope;
  status: TaskStatus | null;
  onShowAll: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { isAdmin } = useCurrentGroup();
  const actions = useTaskActions();
  let description = t('tasks.emptyAll');
  if (status !== null) description = t('tasks.emptyFiltered');
  else if (scope === 'mine') description = t('tasks.emptyMine');

  return (
    <EmptyState
      title={t('tasks.emptyTitle')}
      description={description}
      action={
        <div className={styles.emptyActions}>
          {isAdmin && status === null && (
            <Button icon={<Plus size={18} />} onClick={() => actions.create()}>
              {t('tasks.add')}
            </Button>
          )}
          {scope === 'mine' && (
            <Button variant="secondary" onClick={onShowAll}>
              {t('tasks.showAll')}
            </Button>
          )}
        </div>
      }
    />
  );
}

function TaskSections({
  arranged,
  toggle,
  isToggling,
}: {
  arranged: ArrangedTasks;
} & Omit<TaskListProps, 'items'>): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.sections}>
      {arranged.overdue.length > 0 && (
        <section id="overdue" className={styles.section}>
          <h2 className={clsx(styles.dayLabel, styles.overdueLabel)}>
            <AlertTriangle size={16} />
            {t('tasks.overdueSection')}
            <span className={styles.count}>{arranged.overdue.length}</span>
          </h2>
          <TaskList items={arranged.overdue} toggle={toggle} isToggling={isToggling} />
        </section>
      )}
      {arranged.days.map(({ day, items }) => {
        const relative = formatDayLabel(day);
        return (
          <section
            key={day.toISOString()}
            id={relative === 'today' ? 'today' : undefined}
            className={styles.section}
          >
            <h2 className={clsx(styles.dayLabel, relative === 'today' && styles.todayLabel)}>
              {relative !== null && <span>{t(`common.${relative}`)}</span>}
              <span className={styles.date}>{formatDate(day)}</span>
            </h2>
            <TaskList items={items} toggle={toggle} isToggling={isToggling} />
          </section>
        );
      })}
    </div>
  );
}

/** Над списком: «перші кроки» для нової групи або підсумок дня */
function TasksIntro({
  tasks,
  today,
  onboarding,
  onShowSection,
  onShowUnassigned,
}: {
  tasks: Task[];
  today: Date;
  onboarding: { visible: boolean; hide: () => void };
  onShowSection: (id: 'today' | 'overdue') => void;
  onShowUnassigned: () => void;
}): JSX.Element {
  const { me, isAdmin } = useCurrentGroup();
  return onboarding.visible ? (
    <Onboarding taskCount={tasks.length} onHide={onboarding.hide} />
  ) : (
    <TodayHero
      tasks={tasks}
      userId={me.id}
      userName={me.name}
      today={today}
      isAdmin={isAdmin}
      onShowToday={() => onShowSection('today')}
      onShowOverdue={() => onShowSection('overdue')}
      onShowUnassigned={onShowUnassigned}
    />
  );
}

export function TasksPage(): JSX.Element {
  const { t } = useTranslation();
  const { group, me, isAdmin } = useCurrentGroup();
  const range = useTaskRange();
  const { data: tasks, isPending, error, refetch } = useTasks(group.id, range.from, range.to);
  const { toggle, isPending: isToggling } = useToggleTask(group.id);
  const { scope, status, defaultScope, setFilter, update } = useTaskFilters();

  const actions = useTaskActions();
  const onboarding = useOnboardingVisible(tasks?.length ?? 0);

  /** Перехід з банера: показуємо свої задачі без фільтра статусу і прокручуємо до блоку */
  const showSection = (id: 'today' | 'overdue'): void => {
    update((current) => {
      // банер показує мої задачі — тож і список перемикаємо на «Мої»
      current.set('scope', 'mine');
      current.delete('status');
    });
    scrollToSection(id);
  };

  const arranged = useMemo(
    () => (tasks ? arrangeTasks(tasks, { scope, status }, me.id) : null),
    [tasks, scope, status, me.id],
  );

  const isEmpty = arranged !== null && arranged.overdue.length === 0 && arranged.days.length === 0;

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        subtitle={`${group.name} · ${formatDate(range.today, 'd MMMM, EEEE')}`}
        actions={
          isAdmin && (
            <Button icon={<Plus size={18} />} onClick={() => actions.create()}>
              {t('tasks.add')}
            </Button>
          )
        }
      />

      {tasks && (
        <TasksIntro
          tasks={tasks}
          today={range.today}
          onboarding={onboarding}
          onShowSection={showSection}
          onShowUnassigned={() =>
            update((current) => {
              current.set('scope', 'all');
              current.set('status', 'unassigned');
            })
          }
        />
      )}

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <TasksToolbar
            scope={scope}
            status={status}
            defaultScope={defaultScope}
            setFilter={setFilter}
          />

          {isPending && <PageSpinner label={t('common.loading')} />}

          {error && (
            <EmptyState
              title={errorMessage(error, t)}
              action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
            />
          )}

          {isEmpty && (
            <TasksEmpty scope={scope} status={status} onShowAll={() => setFilter('scope', 'all')} />
          )}

          {arranged && !isEmpty && (
            <TaskSections arranged={arranged} toggle={toggle} isToggling={isToggling} />
          )}
        </div>
        {tasks && <TasksAside group={group} tasks={tasks} today={range.today} userId={me.id} />}
      </div>
    </>
  );
}
