import { clsx } from 'clsx';
import { Check, X } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { checkPassword, type PasswordRules as Rules } from '../../shared/lib/validation';
import styles from './auth.module.css';

// у тому ж порядку, що й поля checkPassword
const RULE_KEYS: readonly (keyof Rules)[] = ['length', 'letter', 'digit'];

/** Показує, яке саме правило порушено (FR-03) */
export function PasswordRules({
  password,
  showErrors,
}: {
  password: string;
  showErrors: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const rules = checkPassword(password);

  return (
    <ul className={styles.rules}>
      {RULE_KEYS.map((rule) => {
        const ok = rules[rule];
        return (
          <li
            key={rule}
            className={clsx(styles.rule, ok && styles.ruleOk, !ok && showErrors && styles.ruleBad)}
          >
            {ok ? <Check size={13} /> : showErrors ? <X size={13} /> : null}
            {t(`auth.rules.${rule}`)}
          </li>
        );
      })}
    </ul>
  );
}
