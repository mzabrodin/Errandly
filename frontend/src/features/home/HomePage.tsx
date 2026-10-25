import { useQueries } from '@tanstack/react-query';
import { addDays, endOfWeek, formatDistanceToNow, startOfDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ArrowRight, Plus } from 'lucide-react';
import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useSession } from '../../shared/api/auth';
import { http } from '../../shared/api/client';
import { groupKeys, useGroups } from '../../shared/api/groups';
import { taskKeys } from '../../shared/api/tasks';
import type { Group, GroupSummary, Task } from '../../shared/api/types';
import { formatDate, formatTime, weekOptions } from '../../shared/lib/dates';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Avatar } from '../../shared/ui/Avatar';
import { ButtonLink } from '../../shared/ui/Button';
import { Cloud, FlowerFace, Hills } from '../../shared/ui/Decor';
import { PageSpinner } from '../../shared/ui/Spinner';
import styles from './HomePage.module.css';

const LOOKAHEAD_DAYS = 14;

function greetingKey(hour: number) {
  if (hour < 5) return 'home.night';
  if (hour < 12) return 'home.morning';
  if (hour < 18) return 'home.day';
  return 'home.evening';
}

function byDue(a: Task, b: Task): number {
  return a.dueAt.localeCompare(b.dueAt);
}

/** Найважливіша задача користувача: спершу прострочена, далі найближча запланована */
function pickNext(tasks: Task[], userId: string): Task | null {
  const mine = tasks.filter((task) => task.assigneeId === userId);
  return (
    mine.filter((task) => task.status === 'overdue').toSorted(byDue)[0] ??
    mine.filter((task) => task.status === 'planned').toSorted(byDue)[0] ??
    null
  );
}

function NextTask({
  next,
  nextGroup,
}: {
  next: Task | null;
  nextGroup: GroupSummary | null | undefined;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <section>
      <h2 className={styles.label}>
        {next?.status === 'overdue' ? t('home.nextOverdue') : t('home.nextTitle')}
      </h2>
      {next ? (
        <Link
          to={`/g/${next.groupId}/tasks/${next.id}`}
          state={{ from: '/home' }}
          className={`${styles.nextCard} ${next.status === 'overdue' ? styles.nextOverdue : ''}`}
        >
          <span className={styles.nextWhen}>
            {formatDate(new Date(next.dueAt), 'd MMMM, EEEEEE')} · {formatTime(next.dueAt)}
            <span className={styles.nextRelative}>
              {formatDistanceToNow(new Date(next.dueAt), {
                locale: uk,
                addSuffix: true,
              })}
            </span>
          </span>
          <span className={styles.nextTitle}>{next.title}</span>
          <span className={styles.nextGroup}>
            {nextGroup?.name}
            <ArrowRight size={18} />
          </span>
        </Link>
      ) : (
        <p className={styles.nextEmpty}>{t('home.noNext')}</p>
      )}
    </section>
  );
}

function GroupCard({
  summary,
  group,
  weekCount,
}: {
  summary: GroupSummary;
  group: Group | undefined;
  weekCount: number;
}): JSX.Element {
  const { t } = useTranslation();
  const color = group?.members[0]?.color ?? 'var(--lime)';

  return (
    <li>
      <Link to={`/g/${summary.id}/tasks`} className={styles.groupCard}>
        <span className={styles.groupBrand}>errandly*</span>
        <span className={styles.groupName}>{summary.name}</span>
        <FlowerFace className={styles.groupFlower} size={120} color={color} />
        <span className={styles.groupFooter}>
          <span className={styles.avatars}>
            {group?.members.slice(0, 5).map((member) => (
              <Avatar
                key={member.userId}
                name={member.name}
                src={member.avatarUrl}
                color={member.color}
                size={28}
              />
            ))}
          </span>
          <span className={styles.groupMeta}>
            {weekCount > 0 ? t('home.openWeek', { count: weekCount }) : t('home.noneWeek')}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function HomePage(): JSX.Element {
  const { t } = useTranslation();
  useDocumentTitle(t('titles.home'));
  const { data: user } = useSession();
  const { data: groups, isPending } = useGroups();
  const [now] = useState(() => new Date());
  const [range] = useState(() => ({
    from: startOfDay(addDays(now, -14)).toISOString(),
    to: addDays(now, LOOKAHEAD_DAYS).toISOString(),
  }));

  const details = useQueries({
    queries: (groups ?? []).map((group) => ({
      queryKey: groupKeys.detail(group.id),
      queryFn: () => http.get<Group>(`/groups/${group.id}`),
    })),
  });
  const taskLists = useQueries({
    queries: (groups ?? []).map((group) => ({
      queryKey: taskKeys.range(group.id, range.from, range.to),
      queryFn: () =>
        http.get<Task[]>(
          `/groups/${group.id}/tasks?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
        ),
    })),
  });

  if (isPending || !user) return <PageSpinner label={t('common.loading')} />;

  const allTasks = taskLists.flatMap((query) => query.data ?? []);
  const next = pickNext(allTasks, user.id);
  const nextGroup = next && groups?.find((group) => group.id === next.groupId);
  const weekEnd = endOfWeek(now, weekOptions).getTime();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <Cloud className={styles.cloudA} size={150} />
        <Cloud className={styles.cloudB} size={90} />
        <Cloud className={styles.cloudC} size={64} />
        <Hills className={styles.hills} />
        <div className={styles.heroText}>
          <span className={styles.date}>{formatDate(now, 'EEEE, d MMMM')}</span>
          <h1 className={styles.greeting}>
            {t(greetingKey(now.getHours()), { name: user.name.split(' ')[0] })}
          </h1>
        </div>
        <FlowerFace className={styles.heroFlower} size={110} color="var(--lime)" />
      </section>

      <NextTask next={next} nextGroup={nextGroup} />

      <section>
        <h2 className={styles.label}>{t('home.groupsTitle')}</h2>
        <ul className={styles.groups}>
          {groups?.map((summary, index) => {
            const weekCount = (taskLists[index]?.data ?? []).filter((task) => {
              const due = new Date(task.dueAt).getTime();
              return task.assigneeId === user.id && task.status !== 'done' && due <= weekEnd;
            }).length;
            return (
              <GroupCard
                key={summary.id}
                summary={summary}
                group={details[index]?.data}
                weekCount={weekCount}
              />
            );
          })}
          <li>
            <ButtonLink
              to="/groups/new"
              variant="secondary"
              className={styles.newGroup}
              icon={<Plus size={18} />}
            >
              {t('home.newGroup')}
            </ButtonLink>
          </li>
        </ul>
      </section>
    </div>
  );
}
