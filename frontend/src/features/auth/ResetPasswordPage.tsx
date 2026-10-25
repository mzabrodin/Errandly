import { CircleCheck } from 'lucide-react';
import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { useResetPassword } from '../../shared/api/auth';
import { errorMessage, isApiError } from '../../shared/api/errors';
import { isValidPassword } from '../../shared/lib/validation';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Field, FormError } from '../../shared/ui/Field';
import styles from './auth.module.css';
import { PasswordInput } from './PasswordInput';
import { PasswordRules } from './PasswordRules';

export function ResetPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!isValidPassword(password)) return;
    reset.mutate({ token, password });
  };

  if (reset.isSuccess) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{t('auth.resetTitle')}</h1>
        <div className={styles.notice}>
          <CircleCheck size={40} color="var(--grass)" />
          <p>{t('auth.resetDone')}</p>
          <ButtonLink to="/login">{t('auth.toLogin')}</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('auth.resetTitle')}</h1>
      <form className={styles.form} onSubmit={submit} noValidate>
        {reset.error && (
          <FormError>
            {isApiError(reset.error, 'TOKEN_INVALID') ? (
              <>
                {t('auth.errors.tokenInvalid')}{' '}
                <Link to="/forgot-password" className={styles.link}>
                  {t('auth.forgot')}
                </Link>
              </>
            ) : (
              errorMessage(reset.error, t)
            )}
          </FormError>
        )}
        <Field
          label={t('auth.newPassword')}
          error={
            submitted && !isValidPassword(password) ? t('auth.errors.passwordWeak') : undefined
          }
        >
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <PasswordRules password={password} showErrors={submitted} />
        <Button type="submit" size="lg" block loading={reset.isPending}>
          {t('auth.resetSubmit')}
        </Button>
      </form>
    </div>
  );
}
