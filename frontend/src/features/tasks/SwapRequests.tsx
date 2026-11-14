import { ArrowLeftRight } from 'lucide-react';
import type { JSX } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useAnswerSwap, useCancelSwap, useSwaps } from '../../shared/api/swaps';
import type { Swap } from '../../shared/api/types';
import { formatDate, formatTime } from '../../shared/lib/dates';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { FormError } from '../../shared/ui/Field';
import { useToast } from '../../shared/ui/Toast';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import styles from './SwapRequests.module.css';
import { useSwapError } from './swaps';

type SwapTask = Swap['offeredTask'];

function TaskLine({ label, task }: { label: string; task: SwapTask }): JSX.Element {
  return (
    <div className={styles.line}>
      <dt>{label}</dt>
      <dd>
        <strong>{task.title}</strong> · {formatDate(task.dueAt, 'd MMM, EEEEEE')},{' '}
        {formatTime(task.dueAt)}
      </dd>
    </div>
  );
}

interface SwapItemProps {
  swap: Swap;
  busy: boolean;
  onAnswer: (accept: boolean) => void;
  onCancel: () => void;
}

function SwapItem({ swap, busy, onAnswer, onCancel }: SwapItemProps): JSX.Element {
  const { t } = useTranslation();
  const { me, membersById } = useCurrentGroup();
  const incoming = swap.recipientId === me.id;
  const other = membersById.get(incoming ? swap.proposerId : swap.recipientId);
  const name = other?.name ?? '';

  return (
    <li className={styles.item}>
      <p className={styles.lead}>
        {other && <Avatar name={other.name} src={other.avatarUrl} color={other.color} size={28} />}
        <span>
          <Trans
            i18nKey={incoming ? 'swaps.incoming' : 'swaps.outgoing'}
            values={{ name }}
            components={{ b: <strong /> }}
          />
        </span>
      </p>
      <dl className={styles.trade}>
        <TaskLine
          label={t('swaps.youGive')}
          task={incoming ? swap.requestedTask : swap.offeredTask}
        />
        <TaskLine
          label={t('swaps.youTake')}
          task={incoming ? swap.offeredTask : swap.requestedTask}
        />
      </dl>
      <div className={styles.actions}>
        {incoming ? (
          <>
            <Button size="sm" variant="lime" disabled={busy} onClick={() => onAnswer(true)}>
              {t('swaps.accept')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAnswer(false)}>
              {t('swaps.decline')}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            {t('swaps.cancel')}
          </Button>
        )}
      </div>
    </li>
  );
}

export function SwapRequests(): JSX.Element | null {
  const { t } = useTranslation();
  const toast = useToast();
  const { group } = useCurrentGroup();
  const { data: swaps } = useSwaps(group.id);
  const answer = useAnswerSwap(group.id);
  const cancel = useCancelSwap(group.id);
  const swapError = useSwapError();
  const busy = answer.isPending || cancel.isPending;
  const error = swapError(answer.error ?? cancel.error);

  if (!swaps || swaps.length === 0) return null;

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>
        <ArrowLeftRight size={18} />
        {t('swaps.title')}
      </h2>
      <ul className={styles.list}>
        {swaps.map((swap) => (
          <SwapItem
            key={swap.id}
            swap={swap}
            busy={busy}
            onAnswer={(accept) =>
              answer.mutate(
                { swapId: swap.id, accept },
                { onSuccess: () => toast(t(accept ? 'swaps.accepted' : 'swaps.declined')) },
              )
            }
            onCancel={() =>
              cancel.mutate(swap.id, { onSuccess: () => toast(t('swaps.cancelled')) })
            }
          />
        ))}
      </ul>
      {error !== null && <FormError>{error}</FormError>}
    </section>
  );
}
