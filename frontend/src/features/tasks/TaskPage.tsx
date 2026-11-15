import { clsx } from 'clsx';
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  Check,
  Pencil,
  Repeat,
  Trash2,
  UserRoundCog,
} from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { ForbiddenView } from '../../pages/ForbiddenView';
import { hasStatus } from '../../shared/api/errors';
import { useSeries, useTask } from '../../shared/api/tasks';
import type { Task } from '../../shared/api/types';
import { formatDate, formatTime } from '../../shared/lib/dates';
import { groupPath, taskPath } from '../../shared/lib/routes';
import { toStringList } from '../../shared/lib/translationList';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Cloud } from '../../shared/ui/Decor';
import { EmptyState } from '../../shared/ui/EmptyState';
import { LoadError } from '../../shared/ui/LoadError';
import { Pill } from '../../shared/ui/Pill';
import { PageSpinner } from '../../shared/ui/Spinner';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { AssigneeLabel } from './AssigneeLabel';
import { canProposeSwap } from './swaps';
import { useTaskActions } from './taskActionsContext';
import { DifficultyDots } from './TaskCard';
import styles from './TaskPage.module.css';
import { canToggleTask, useToggleTask } from './useToggleTask';

const HISTORY_BEFORE = 6;
const HISTORY_AFTER = 6;

function useRecurrenceLabel(task: Task): string {
  const { t } = useTranslation();
  const weekdayNames = toStringList(t('weekdays.short', { returnObjects: true }));
  const base = t(`tasks.repeat.${task.recurrence.type}`);
  if (task.recurrence.type !== 'weekly') return base;
  return `${base}: ${task.recurrence.weekdays.map((day) => weekdayNames[day - 1]).join(', ')}`;
}

function SeriesHistory({ task }: { task: Task }): JSX.Element | null {
  const { t } = useTranslation();
  const { group, memberOf } = useCurrentGroup();
  const { data: series, isPending } = useSeries(group.id, task.seriesId);

  if (task.recurrence.type === 'once') return null;

  const index = series?.findIndex((item) => item.id === task.id) ?? -1;
  const visible =
    series && index >= 0
      ? series.slice(Math.max(0, index - HISTORY_BEFORE), index + HISTORY_AFTER + 1)
      : [];

  return (
    <Card className={styles.history}>
      <Cloud className={styles.cloud} size={110} />
      <h2 className={styles.sectionTitle}>{t('taskPage.history')}</h2>
      <p className={styles.muted}>{t('taskPage.historyText')}</p>
      {isPending ? (
        <PageSpinner label={t('common.loading')} />
      ) : (
        <ol className={styles.timeline}>
          {visible.map((item) => {
            const assignee = memberOf(item.assigneeId);
            const current = item.id === task.id;
            return (
              <li key={item.id} className={clsx(styles.row, current && styles.rowCurrent)}>
                <Link
                  to={taskPath(group.id, item.id)}
                  className={styles.rowLink}
                  aria-current={current ? 'page' : undefined}
                >
                  <span className={styles.rowDate}>{formatDate(item.dueAt, 'd MMM, EEEEEE')}</span>
                  <span className={styles.rowWho}>
                    {assignee ? <AssigneeLabel member={assignee} size={22} /> : t('tasks.nobody')}
                  </span>
                  <Pill tone={item.status} className={styles.rowStatus}>
                    {item.status === 'done' ? <Check size={13} /> : null}
                    {t(`tasks.status.${item.status}`)}
                  </Pill>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** The `from` path from navigation state (set by the list, the calendar and home) */
function fromState(state: unknown): string | undefined {
  if (state === null || typeof state !== 'object' || !('from' in state)) return undefined;
  return typeof state.from === 'string' ? state.from : undefined;
}

/** Go back to where the task was opened from (list, calendar, home) */
function useBackLink(groupId: string): { backTo: string; backLabel: string } {
  const { t } = useTranslation();
  const location = useLocation();
  const from = fromState(location.state);
  const backTo =
    from !== undefined && from.startsWith('/') && !from.startsWith('//')
      ? from
      : groupPath(groupId);
  let backLabel = t('taskPage.back');
  if (from?.includes('/calendar') === true) backLabel = t('taskPage.backCalendar');
  else if (from?.startsWith('/home') === true) backLabel = t('taskPage.backHome');
  return { backTo, backLabel };
}

export function TaskPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId = '' } = useParams();
  const { group, me, isAdmin, memberOf } = useCurrentGroup();
  const { data: task, isPending, error, refetch } = useTask(group.id, taskId);
  const { toggle, isPending: isToggling } = useToggleTask(group.id);
  const actions = useTaskActions();
  const { backTo, backLabel } = useBackLink(group.id);
  useDocumentTitle(task?.title);

  if (isPending) return <PageSpinner label={t('common.loading')} />;
  if (hasStatus(error, 403)) return <ForbiddenView />;
  if (hasStatus(error, 404)) {
    return (
      <EmptyState
        title={t('taskPage.notFound')}
        action={<ButtonLink to={backTo}>{t('taskPage.back')}</ButtonLink>}
      />
    );
  }
  if (error !== null) {
    return <LoadError error={error} onRetry={() => void refetch()} />;
  }

  return (
    <TaskDetails
      task={task}
      onEdit={() => actions.edit(task)}
      onReassign={() => actions.reassign(task)}
      onProposeSwap={() => actions.proposeSwap(task)}
      canSwap={canProposeSwap(task, me.id)}
      onDelete={() =>
        actions.remove(task, () => {
          void navigate(backTo, { replace: true });
        })
      }
      toggle={() => toggle(task)}
      toggling={isToggling(task.id)}
      isMine={task.assigneeId === me.id}
      isAdmin={isAdmin}
      assigneeName={memberOf(task.assigneeId)?.name}
      backTo={backTo}
      backLabel={backLabel}
    />
  );
}

interface TaskDetailsProps {
  task: Task;
  isMine: boolean;
  isAdmin: boolean;
  assigneeName: string | undefined;
  toggling: boolean;
  toggle: () => void;
  onEdit: () => void;
  onReassign: () => void;
  onProposeSwap: () => void;
  canSwap: boolean;
  onDelete: () => void;
  backTo: string;
  backLabel: string;
}

function TaskFacts({ task }: { task: Task }): JSX.Element {
  const { t } = useTranslation();
  const { memberOf } = useCurrentGroup();
  const recurrence = useRecurrenceLabel(task);
  const assignee = memberOf(task.assigneeId);

  return (
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt>
          <CalendarClock size={16} />
          {t('taskPage.when')}
        </dt>
        <dd>
          {formatDate(task.dueAt, 'd MMMM, EEEE')}
          <span className={styles.time}>{formatTime(task.dueAt)}</span>
        </dd>
      </div>
      <div className={styles.fact}>
        <dt>
          <Repeat size={16} />
          {t('taskPage.repeat')}
        </dt>
        <dd>{recurrence}</dd>
      </div>
      <div className={styles.fact}>
        <dt>{t('taskPage.difficulty')}</dt>
        <dd className={styles.difficulty}>
          <DifficultyDots value={task.difficulty} />
          <span>{task.difficulty}/5</span>
        </dd>
      </div>
      <div className={styles.fact}>
        <dt>{t('taskPage.assignee')}</dt>
        <dd>
          {assignee ? (
            <span className={styles.assignee}>
              <Avatar
                name={assignee.name}
                src={assignee.avatarUrl}
                color={assignee.color}
                size={32}
              />
              <span>
                {assignee.name}
                <small>{task.manuallyAssigned ? t('taskPage.manual') : t('taskPage.auto')}</small>
              </span>
            </span>
          ) : (
            <span className={styles.muted}>{t('taskPage.unassignedHint')}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

type TaskButtonsProps = Omit<TaskDetailsProps, 'backTo' | 'backLabel'>;

function TaskButtons({
  task,
  isMine,
  isAdmin,
  assigneeName,
  toggling,
  toggle,
  onEdit,
  onReassign,
  onProposeSwap,
  canSwap,
  onDelete,
}: TaskButtonsProps): JSX.Element {
  const { t } = useTranslation();
  const done = task.status === 'done';

  return (
    <div className={styles.actions}>
      {canToggleTask(task, { isMine, isAdmin }) ? (
        <Button
          size="lg"
          variant={done ? 'secondary' : 'lime'}
          icon={<Check size={18} />}
          loading={toggling}
          onClick={toggle}
        >
          {done ? t('taskPage.undo') : t('taskPage.markDone')}
        </Button>
      ) : (
        assigneeName !== undefined &&
        assigneeName !== '' &&
        !done && <p className={styles.muted}>{t('taskPage.notYours', { name: assigneeName })}</p>
      )}
      {canSwap && (
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeftRight size={15} />}
          onClick={onProposeSwap}
        >
          {t('swaps.propose')}
        </Button>
      )}
      {isAdmin && (
        <div className={styles.adminActions}>
          <Button variant="secondary" size="sm" icon={<Pencil size={15} />} onClick={onEdit}>
            {t('tasks.edit')}
          </Button>
          {!done && (
            <Button
              variant="secondary"
              size="sm"
              icon={<UserRoundCog size={15} />}
              onClick={onReassign}
            >
              {t('tasks.reassign')}
            </Button>
          )}
          <Button variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}

function TaskDetails({ backTo, backLabel, ...rest }: TaskDetailsProps): JSX.Element {
  const { t } = useTranslation();
  const { group } = useCurrentGroup();
  const { task } = rest;
  const done = task.status === 'done';

  return (
    <>
      <Link to={backTo} className={styles.back}>
        <ArrowLeft size={16} />
        {backLabel}
      </Link>

      <header className={styles.header}>
        <Pill tone={task.status}>{t(`tasks.status.${task.status}`)}</Pill>
        <h1 className={clsx(styles.title, done && styles.titleDone)}>{task.title}</h1>
        <p className={styles.description}>
          {task.description === '' ? t('taskPage.noDescription') : task.description}
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card className={styles.details} pop>
            <TaskFacts task={task} />

            {task.completedAt !== null && task.completedAt !== '' && (
              <p className={styles.completed}>
                <Check size={16} />
                {t('taskPage.completedAt', {
                  date: `${formatDate(task.completedAt, 'd MMMM')}, ${formatTime(task.completedAt)}`,
                })}
              </p>
            )}

            <TaskButtons {...rest} />
          </Card>
          <p className={styles.groupNote}>
            {t('taskPage.group')}: <strong>{group.name}</strong>
          </p>
        </div>

        <SeriesHistory task={task} />
      </div>
    </>
  );
}
