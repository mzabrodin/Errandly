import { clsx } from 'clsx';
import { Check, Clock, MoreHorizontal, Repeat } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import type { Member, Task, TaskStatus } from '../../shared/api/types';
import { formatTime } from '../../shared/lib/dates';
import { Avatar } from '../../shared/ui/Avatar';
import { Asterisk } from '../../shared/ui/Decor';
import { Pill } from '../../shared/ui/Pill';
import styles from './TaskCard.module.css';
import { TaskQuickMenu } from './TaskQuickMenu';
import { canToggleTask } from './useToggleTask';

export function DifficultyDots({ value }: { value: number }): JSX.Element {
  const { t } = useTranslation();
  return (
    <span className={styles.dots} title={`${t('common.difficulty')}: ${value}/5`}>
      <span className="visually-hidden">
        {t('common.difficulty')}: {value}/5
      </span>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={clsx(styles.dot, index < value && styles.dotOn)} aria-hidden />
      ))}
    </span>
  );
}

// для запланованих окремого стилю немає
const statusClass: Record<TaskStatus, string | undefined> = {
  planned: undefined,
  done: styles.done,
  overdue: styles.overdue,
  unassigned: styles.unassigned,
};

interface TaskCardProps {
  task: Task;
  assignee: Member | undefined;
  isMine: boolean;
  isAdmin: boolean;
  pending: boolean;
  onToggle: () => void;
}

export function TaskCard({
  task,
  assignee,
  isMine,
  isAdmin,
  pending,
  onToggle,
}: TaskCardProps): JSX.Element {
  const { t } = useTranslation();
  const done = task.status === 'done';
  const toggleable = canToggleTask(task, { isMine, isAdmin });

  return (
    <li
      className={clsx(styles.card, statusClass[task.status], isMine && styles.mine)}
      style={{
        ['--member-color' as string]: assignee?.color ?? 'var(--cream-deep)',
      }}
    >
      <button
        type="button"
        className={styles.check}
        onClick={onToggle}
        disabled={!toggleable || pending}
        aria-pressed={done}
        aria-label={
          toggleable
            ? t(done ? 'tasks.undo' : 'tasks.markDone', { title: task.title })
            : t(done ? 'tasks.undoLocked' : 'tasks.notYours')
        }
        title={toggleable ? undefined : t(done ? 'tasks.undoLocked' : 'tasks.notYours')}
      >
        {done && <Check className={styles.checkIcon} size={20} strokeWidth={3} />}
        {done && <Asterisk className={styles.burst} size={44} color="var(--lime)" />}
      </button>

      <TaskQuickMenu task={task}>
        {(props) => (
          <button type="button" className={styles.body} {...props}>
            <span className={styles.hint} aria-hidden data-menu-anchor>
              <MoreHorizontal size={18} />
            </span>
            <span className={styles.titleRow}>
              <span className={styles.title}>{task.title}</span>
              {task.status !== 'planned' && (
                <Pill tone={task.status} className={styles.status}>
                  {t(`tasks.status.${task.status}`)}
                </Pill>
              )}
            </span>
            {task.description !== '' && (
              <span className={styles.description}>{task.description}</span>
            )}
            <span className={styles.meta}>
              <span className={styles.metaItem}>
                <Clock size={14} />
                {formatTime(task.dueAt)}
              </span>
              {task.recurrence.type !== 'once' && (
                <span className={styles.metaItem}>
                  <Repeat size={14} />
                  {t(`tasks.repeat.${task.recurrence.type}`)}
                </span>
              )}
              <DifficultyDots value={task.difficulty} />
              <span className={styles.assignee}>
                {assignee ? (
                  <>
                    <Avatar
                      name={assignee.name}
                      src={assignee.avatarUrl}
                      color={assignee.color}
                      size={24}
                    />
                    <span>{isMine ? t('common.you') : assignee.name.split(' ')[0]}</span>
                    {task.manuallyAssigned && (
                      <span className="visually-hidden">({t('tasks.manual')})</span>
                    )}
                  </>
                ) : (
                  <span className={styles.nobody}>{t('tasks.nobody')}</span>
                )}
              </span>
            </span>
          </button>
        )}
      </TaskQuickMenu>
    </li>
  );
}
