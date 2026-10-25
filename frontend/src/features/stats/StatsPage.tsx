import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../shared/api/errors';
import { useStats } from '../../shared/api/stats';
import type { Member, MemberStats, StatsPeriod } from '../../shared/api/types';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Cloud, FlowerFace } from '../../shared/ui/Decor';
import { EmptyState } from '../../shared/ui/EmptyState';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Segmented } from '../../shared/ui/Segmented';
import { PageSpinner } from '../../shared/ui/Spinner';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import styles from './StatsPage.module.css';

interface Totals {
  done: number;
  overdue: number;
  difficulty: number;
}

/** Рядок статистики разом з учасником, якому він належить */
interface Row {
  item: MemberStats;
  member: Member;
}

function TotalsCard({ totals, rows }: { totals: Totals; rows: Row[] }): JSX.Element {
  const { t } = useTranslation();

  return (
    <Card className={styles.totals} pop>
      <Cloud className={styles.cloud} size={150} />
      <Cloud className={styles.cloudSmall} size={70} />
      <h2 className={styles.totalsTitle}>{t('stats.groupTotal')}</h2>
      <dl className={styles.numbers}>
        <div>
          <dt>{t('stats.done')}</dt>
          <dd>{totals.done}</dd>
        </div>
        <div>
          <dt>{t('stats.overdue')}</dt>
          <dd className={styles.bad}>{totals.overdue}</dd>
        </div>
        <div>
          <dt>{t('stats.difficulty')}</dt>
          <dd>{totals.difficulty}</dd>
        </div>
      </dl>
      <div className={styles.shareBlock}>
        <span className={styles.shareLabel}>{t('stats.share')}</span>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- смуга зі span-сегментів, <img> тут не підходить */}
        <div className={styles.shareBar} role="img" aria-label={t('stats.share')}>
          {rows.map(({ item, member }) => {
            const share = totals.difficulty !== 0 ? (item.difficulty / totals.difficulty) * 100 : 0;
            return share > 0 ? (
              <span
                key={item.userId}
                className={styles.shareSegment}
                style={{ width: `${share}%`, background: member.color }}
                title={`${member.name}: ${Math.round(share)}%`}
              >
                {share >= 12 && `${Math.round(share)}%`}
              </span>
            ) : null;
          })}
        </div>
      </div>
    </Card>
  );
}

function MemberStatsCard({
  row: { item, member },
  topContributor,
  share,
  isMe,
}: {
  row: Row;
  topContributor: boolean;
  share: number;
  isMe: boolean;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <Card as="li" className={styles.member}>
      {topContributor && (
        <span className={styles.sticker}>
          <FlowerFace size={26} color={member.color} />
          {t('stats.topContributor')}
        </span>
      )}
      <div className={styles.memberHead}>
        <Avatar name={member.name} src={member.avatarUrl} color={member.color} size={40} />
        <div>
          <div className={styles.memberName}>
            {member.name}
            {isMe && <span className={styles.you}> ({t('common.you')})</span>}
          </div>
          <div className={styles.memberShare}>{share}%</div>
        </div>
      </div>
      <dl className={styles.memberNumbers}>
        <div>
          <dt>{t('stats.done')}</dt>
          <dd>{item.done}</dd>
        </div>
        <div>
          <dt>{t('stats.overdue')}</dt>
          <dd className={item.overdue !== 0 ? styles.bad : undefined}>{item.overdue}</dd>
        </div>
        <div>
          <dt>{t('stats.difficultyShort')}</dt>
          <dd>{item.difficulty}</dd>
        </div>
      </dl>
      <div className={styles.bar} aria-hidden>
        <span style={{ width: `${share}%`, background: member.color }} />
      </div>
    </Card>
  );
}

/** Статистика групи за тиждень / місяць (FR-39) */
export function StatsPage(): JSX.Element {
  const { t } = useTranslation();
  const { group, me, membersById } = useCurrentGroup();
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const { data: stats, isPending, error, refetch } = useStats(group.id, period);

  const totals = (stats ?? []).reduce(
    (sum, item) => ({
      done: sum.done + item.done,
      overdue: sum.overdue + item.overdue,
      difficulty: sum.difficulty + item.difficulty,
    }),
    { done: 0, overdue: 0, difficulty: 0 },
  );
  const rows = (stats ?? [])
    .flatMap((item): Row[] => {
      const member = membersById.get(item.userId);
      return member === undefined ? [] : [{ item, member }];
    })
    .toSorted((a, b) => b.item.difficulty - a.item.difficulty);

  return (
    <>
      <PageHeader
        title={t('stats.title')}
        subtitle={t('stats.subtitle')}
        actions={
          <Segmented
            label={t('stats.period')}
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'week', label: t('stats.week') },
              { value: 'month', label: t('stats.month') },
            ]}
          />
        }
      />

      {isPending && <PageSpinner label={t('common.loading')} />}
      {error && (
        <EmptyState
          title={errorMessage(error, t)}
          action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
        />
      )}

      {stats && totals.done + totals.overdue === 0 && <EmptyState title={t('stats.empty')} />}

      {stats && totals.done + totals.overdue > 0 && (
        <>
          <TotalsCard totals={totals} rows={rows} />

          <ul className={styles.members}>
            {rows.map((row, index) => {
              const second = rows[1];
              // стікер лише за явного лідерства, без нічиїх
              const topContributor =
                index === 0 &&
                row.item.difficulty > 0 &&
                (second === undefined || row.item.difficulty > second.item.difficulty);
              const share =
                totals.difficulty !== 0
                  ? Math.round((row.item.difficulty / totals.difficulty) * 100)
                  : 0;
              return (
                <MemberStatsCard
                  key={row.item.userId}
                  row={row}
                  topContributor={topContributor}
                  share={share}
                  isMe={row.member.userId === me.id}
                />
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
