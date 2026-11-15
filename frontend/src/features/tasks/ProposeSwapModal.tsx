import { useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { useProposeSwap } from '../../shared/api/swaps';
import { useTasks } from '../../shared/api/tasks';
import type { Task } from '../../shared/api/types';
import { addDays, formatDate, formatTime, now, startOfDay, toIso } from '../../shared/lib/dates';
import { Avatar } from '../../shared/ui/Avatar';
import { FormError } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { Spinner } from '../../shared/ui/Spinner';
import { useToast } from '../../shared/ui/Toast';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import styles from './ProposeSwapModal.module.css';
import { swapCandidates, useSwapError } from './swaps';
import { DifficultyDots } from './TaskCard';

const HORIZON_DAYS = 29;

export function ProposeSwapModal({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { group, me, membersById, memberOf } = useCurrentGroup();
  const [range] = useState(() => ({
    from: toIso(now()),
    to: toIso(addDays(startOfDay(now()), HORIZON_DAYS)),
  }));
  const { data: tasks, isPending } = useTasks(group.id, range.from, range.to);
  const propose = useProposeSwap(group.id);
  const swapError = useSwapError();
  const candidates = tasks ? swapCandidates(tasks, me.id) : new Map<string, Task[]>();

  const choose = (requested: Task): void => {
    if (!task) return;
    propose.mutate(
      { taskId: task.id, requestedTaskId: requested.id },
      {
        onSuccess: () => {
          const name = memberOf(requested.assigneeId)?.name ?? '';
          toast(t('swaps.sent', { name }));
          onClose();
        },
      },
    );
  };

  return (
    <Modal open={task !== null} onClose={onClose} title={t('swaps.proposeTitle')}>
      {task && (
        <>
          <p className={styles.hint}>{t('swaps.proposeHint', { task: task.title })}</p>
          {isPending && <Spinner size={24} />}
          {!isPending && candidates.size === 0 && <p className={styles.empty}>{t('swaps.none')}</p>}
          {[...candidates].map(([assigneeId, options]) => {
            const member = membersById.get(assigneeId);
            if (!member) return null;
            return (
              <section key={assigneeId} className={styles.member}>
                <h3 className={styles.memberName}>
                  <Avatar
                    name={member.name}
                    src={member.avatarUrl}
                    color={member.color}
                    size={24}
                  />
                  {member.name}
                </h3>
                <ul className={styles.options}>
                  {options.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        className={styles.option}
                        disabled={propose.isPending}
                        onClick={() => choose(option)}
                      >
                        <span className={styles.optionTitle}>{option.title}</span>
                        <span className={styles.optionMeta}>
                          {formatDate(option.dueAt, 'd MMM, EEEEEE')}, {formatTime(option.dueAt)}
                          <DifficultyDots value={option.difficulty} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {propose.error && <FormError>{swapError(propose.error)}</FormError>}
        </>
      )}
    </Modal>
  );
}
