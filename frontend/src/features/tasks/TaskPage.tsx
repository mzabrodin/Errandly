import { clsx } from 'clsx';
import {
  ArrowLeft,
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
import { ApiError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/errors';
import { useSeries, useTask } from '../../shared/api/tasks';
import type { Task } from '../../shared/api/types';
import { formatDate, formatTime } from '../../shared/lib/dates';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Cloud } from '../../shared/ui/Decor';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Pill } from '../../shared/ui/Pill';
import { PageSpinner } from '../../shared/ui/Spinner';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { useTaskActions } from './taskActionsContext';
import { DifficultyDots } from './TaskCard';
import styles from './TaskPage.module.css';
import { toStringList } from './translationList';
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
  const { group, membersById } = useCurrentGroup();
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
            const assignee =
              item.assigneeId === null ? undefined : membersById.get(item.assigneeId);
            const current = item.id === task.id;
            return (
              <li key={item.id} className={clsx(styles.row, current && styles.rowCurrent)}>
                <Link
                  to={`/g/${group.id}/tasks/${item.id}`}
                  className={styles.rowLink}
                  aria-current={current ? 'page' : undefined}
                >
                  <span className={styles.rowDate}>
                    {formatDate(new Date(item.dueAt), 'd MMM, EEEEEE')}
                  </span>
                  <span className={styles.rowWho}>
                    {assignee ? (
                      <>
                        <Avatar
                          name={assignee.name}
                          src={assignee.avatarUrl}
                          color={assignee.color}
                          size={22}
                        />
                        {assignee.name.split(' ')[0]}
                      </>
                    ) : (
                      t('tasks.nobody')
                    )}
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

/** Шлях `from` зі стану навігації (його кладуть список, календар і головна) */
function fromState(state: unknown): string | undefined {
  if (state === null || typeof state !== 'object' || !('from' in state)) return undefined;
  return typeof state.from === 'string' ? state.from : undefined;
}

/** Повертаємося туди, звідки відкрили задачу (список, календар, головна) */
function useBackLink(groupId: string): { backTo: string; backLabel: string } {
  const { t } = useTranslation();
  const location = useLocation();
  const from = fromState(location.state);
  const backTo =
    from !== undefined && from.startsWith('/') && !from.startsWith('//')
      ? from
      : `/g/${groupId}/tasks`;
  let backLabel = t('taskPage.back');
  if (from?.includes('/calendar') === true) backLabel = t('taskPage.backCalendar');
  else if (from?.startsWith('/home') === true) backLabel = t('taskPage.backHome');
  return { backTo, backLabel };
}

export function TaskPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taskId = '' } = useParams();
  const { group, me, isAdmin, membersById } = useCurrentGroup();
  const { data: task, isPending, error, refetch } = useTask(group.id, taskId);
  const { toggle, isPending: isToggling } = useToggleTask(group.id);
  const actions = useTaskActions();
  const { backTo, backLabel } = useBackLink(group.id);
  useDocumentTitle(task?.title);

  if (isPending) return <PageSpinner label={t('common.loading')} />;
  if (error instanceof ApiError && error.status === 403) return <ForbiddenView />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title={t('taskPage.notFound')}
        action={<ButtonLink to={backTo}>{t('taskPage.back')}</ButtonLink>}
      />
    );
  }
  if (error !== null) {
    return (
      <EmptyState
        title={errorMessage(error, t)}
        action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  return (
    <TaskDetails
      task={task}
      onEdit={() => actions.edit(task)}
      onReassign={() => actions.reassign(task)}
      onDelete={() =>
        actions.remove(task, () => {
          void navigate(backTo, { replace: true });
        })
      }
      toggle={() => toggle(task)}
      toggling={isToggling(task.id)}
      isMine={task.assigneeId === me.id}
      isAdmin={isAdmin}
      assigneeName={task.assigneeId === null ? undefined : membersById.get(task.assigneeId)?.name}
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
  onDelete: () => void;
  backTo: string;
  backLabel: string;
}

function TaskFacts({ task }: { task: Task }): JSX.Element {
  const { t } = useTranslation();
  const { membersById } = useCurrentGroup();
  const recurrence = useRecurrenceLabel(task);
  const assignee = task.assigneeId === null ? undefined : membersById.get(task.assigneeId);
  const due = new Date(task.dueAt);

  return (
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt>
          <CalendarClock size={16} />
          {t('taskPage.when')}
        </dt>
        <dd>
          {formatDate(due, 'd MMMM, EEEE')}
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
                  date: `${formatDate(new Date(task.completedAt), 'd MMMM')}, ${formatTime(task.completedAt)}`,
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
