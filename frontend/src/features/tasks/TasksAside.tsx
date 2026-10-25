import { isSameDay } from 'date-fns';
import { Check, Plane, RefreshCw } from 'lucide-react';
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import type { Group, Task } from '../../shared/api/types';
import { toDateInputValue } from '../../shared/lib/dates';
import { Avatar } from '../../shared/ui/Avatar';
import styles from './TasksAside.module.css';
import { toStringList } from './translationList';

interface TasksAsideProps {
  group: Group;
  tasks: Task[];
  today: Date;
  userId: string;
}

/** Бічна колонка на широких екранах: хто що робить сьогодні + порада дня */
export function TasksAside({ group, tasks, today, userId }: TasksAsideProps): JSX.Element {
  const { t } = useTranslation();
  const tips = toStringList(t('aside.tips', { returnObjects: true }));
  // порада змінюється щодня, але не «стрибає» між рендерами
  // нова порада при кожному відкритті сторінки + кнопка «ще одну»
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * tips.length));
  const tip = tips[tipIndex % tips.length];
  const nextTip = () =>
    setTipIndex((current) => {
      if (tips.length < 2) return current;
      let next = current;
      while (next === current) next = Math.floor(Math.random() * tips.length);
      return next;
    });
  const day = toDateInputValue(today);
  const todayTasks = tasks.filter((task) => isSameDay(new Date(task.dueAt), today));

  return (
    <aside className={styles.aside}>
      <section className={styles.card}>
        <h2 className={styles.title}>{t('aside.todayTitle')}</h2>
        <ul className={styles.people}>
          {group.members.map((member) => {
            const away = member.absences.some(
              (absence) => absence.from <= day && day <= absence.to,
            );
            const own = todayTasks.filter((task) => task.assigneeId === member.userId);
            const done = own.filter((task) => task.status === 'done').length;
            const allDone = own.length > 0 && done === own.length;
            return (
              <li key={member.userId} className={styles.person}>
                <Avatar name={member.name} src={member.avatarUrl} color={member.color} size={32} />
                <span className={styles.name}>
                  {member.name.split(' ')[0]}
                  {member.userId === userId && (
                    <span className={styles.you}> ({t('common.you')})</span>
                  )}
                </span>
                {away ? (
                  <span className={styles.away}>
                    <Plane size={13} />
                    {t('calendar.away')}
                  </span>
                ) : own.length === 0 ? (
                  <span className={styles.free}>{t('aside.free')}</span>
                ) : (
                  <span className={allDone ? styles.done : styles.progress}>
                    {allDone && <Check size={13} strokeWidth={3} />}
                    {t('aside.progress', { done, total: own.length })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.note}>
        <span className={styles.tape} aria-hidden />
        <div className={styles.noteHead}>
          <h2 className={styles.noteTitle}>{t('aside.tipTitle')}</h2>
          <button
            type="button"
            className={styles.shuffle}
            onClick={nextTip}
            aria-label={t('aside.nextTip')}
            title={t('aside.nextTip')}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <p aria-live="polite">{tip}</p>
      </section>
    </aside>
  );
}
