import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import type { Task } from '../../shared/api/types';
import { endOfWeek, isSameDay, startOfWeek } from '../../shared/lib/dates';
import { Cloud, FlowerFace, Hills } from '../../shared/ui/Decor';
import styles from './TodayHero.module.css';

interface TodayHeroProps {
  tasks: Task[];
  userId: string;
  userName: string;
  today: Date;
  isAdmin: boolean;
  onShowToday: () => void;
  onShowOverdue: () => void;
  onShowUnassigned: () => void;
}

/** Weekly progress bar */
function WeekProgress({
  done,
  total,
  allDone,
}: {
  done: number;
  total: number;
  allDone: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={styles.week}>
      <span className={styles.weekLabel}>{t('today.week')}</span>
      <div
        className={styles.bar}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a custom bar (span inside); <progress> cannot be styled like this
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t('today.week')}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <span className={styles.count}>
        {allDone
          ? t('today.allDone')
          : t('today.weekProgress', {
              done,
              total,
            })}
      </span>
    </div>
  );
}

/** Day summary for the current user: what is due today and how the week is going */
export function TodayHero({
  tasks,
  userId,
  userName,
  today,
  isAdmin,
  onShowToday,
  onShowOverdue,
  onShowUnassigned,
}: TodayHeroProps): JSX.Element {
  const { t } = useTranslation();
  const mine = tasks.filter((task) => task.assigneeId === userId);
  const todayOpen = mine.filter(
    (task) => task.status === 'planned' && isSameDay(task.dueAt, today),
  ).length;
  const overdue = mine.filter((task) => task.status === 'overdue').length;
  // For admins: tasks nobody received (FR-29)
  const unassigned = isAdmin
    ? tasks.filter(
        (task) => (task.assigneeId === null || task.assigneeId === '') && task.status !== 'done',
      ).length
    : 0;

  const weekFrom = startOfWeek(today).getTime();
  const weekTo = endOfWeek(today).getTime();
  const week = mine.filter((task) => {
    const due = new Date(task.dueAt).getTime();
    return due >= weekFrom && due <= weekTo;
  });
  const weekDone = week.filter((task) => task.status === 'done').length;
  // Praise only when nothing is pending: no overdue tasks and nothing left undone this week
  const allDone = overdue === 0 && week.length > 0 && weekDone === week.length;

  return (
    <section className={styles.hero} aria-label={t('today.label')}>
      <Cloud className={styles.cloudBig} size={130} />
      <Cloud className={styles.cloudSmall} size={74} />
      <Hills className={styles.hills} />
      <FlowerFace
        className={styles.flower}
        size={86}
        color={allDone ? 'var(--lime)' : 'var(--flower-alt)'}
      />

      <div className={styles.content}>
        <h2 className={styles.hello}>{t('today.hello', { name: userName.split(' ')[0] })}</h2>
        <div className={styles.summaryRow}>
          {todayOpen === 0 && overdue === 0 && unassigned === 0 ? (
            <p className={styles.summary}>{t('today.summaryNone')}</p>
          ) : (
            <>
              {todayOpen > 0 && (
                <button type="button" className={styles.summary} onClick={onShowToday}>
                  {t('today.summary', { count: todayOpen })} <span aria-hidden>→</span>
                </button>
              )}
              {overdue > 0 && (
                <button
                  type="button"
                  className={`${styles.summary} ${styles.summaryOverdue}`}
                  onClick={onShowOverdue}
                >
                  {t('today.overdue', { count: overdue })} <span aria-hidden>→</span>
                </button>
              )}
              {unassigned > 0 && (
                <button
                  type="button"
                  className={`${styles.summary} ${styles.summaryUnassigned}`}
                  onClick={onShowUnassigned}
                >
                  {t('today.unassigned', { count: unassigned })} <span aria-hidden>→</span>
                </button>
              )}
            </>
          )}
        </div>
        {week.length > 0 && <WeekProgress done={weekDone} total={week.length} allDone={allDone} />}
      </div>
    </section>
  );
}
