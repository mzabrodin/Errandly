import { clsx } from 'clsx';
import { Check, X } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useSettings } from '../../shared/api/settings';
import { Asterisk } from '../../shared/ui/Decor';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import styles from './Onboarding.module.css';
import { useTaskActions } from './taskActionsContext';

/** Чекліст для швидкого старту (NFR-USE-01: група → запрошення → перша задача за 5 хв) */
export function Onboarding({
  taskCount,
  onHide,
}: {
  taskCount: number;
  onHide: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { group } = useCurrentGroup();
  const { data: settings } = useSettings();
  const actions = useTaskActions();

  const steps = [
    { key: 'group', done: true },
    {
      key: 'invite',
      done: group.members.length > 1,
      action: (
        <Link to={`/g/${group.id}/members?invite=1`} className={styles.action}>
          {t('onboarding.inviteAction')}
        </Link>
      ),
    },
    {
      key: 'task',
      done: taskCount > 0,
      action: (
        <button type="button" className={styles.action} onClick={() => actions.create()}>
          {t('onboarding.taskAction')}
        </button>
      ),
    },
    {
      key: 'calendar',
      done: settings?.calendar.connected === true,
      action: (
        <Link to="/settings" className={styles.action}>
          {t('onboarding.calendarAction')}
        </Link>
      ),
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section className={styles.card} aria-labelledby="onboarding-title">
      <Asterisk className={styles.star} size={40} color="var(--grass)" />
      <button
        type="button"
        className={styles.close}
        onClick={onHide}
        aria-label={t('onboarding.hide')}
        title={t('onboarding.hide')}
      >
        <X size={18} />
      </button>
      <h2 id="onboarding-title" className={styles.title}>
        {t('onboarding.title')}
      </h2>
      <p className={styles.progress}>
        {t('onboarding.progress', { done: doneCount, total: steps.length })}
      </p>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.key} className={clsx(styles.step, step.done && styles.done)}>
            <span className={styles.marker} aria-hidden>
              {step.done ? <Check size={16} strokeWidth={3} /> : index + 1}
            </span>
            <span className={styles.text}>
              <strong>{t(`onboarding.${step.key}`)}</strong>
              <span>{t(`onboarding.${step.key}Text`)}</span>
            </span>
            {step.done ? (
              <span className="visually-hidden">{t('onboarding.done')}</span>
            ) : (
              step.action
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
