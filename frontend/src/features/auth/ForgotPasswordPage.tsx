import { MailCheck } from 'lucide-react';
import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useForgotPassword } from '../../shared/api/auth';
import { errorMessage } from '../../shared/api/errors';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { isValidEmail } from '../../shared/lib/validation';
import { Button } from '../../shared/ui/Button';
import { Field, FormError, Input } from '../../shared/ui/Field';
import styles from './auth.module.css';

export function ForgotPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  useDocumentTitle(t('titles.forgot'));
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError(t('auth.errors.emailInvalid'));
      return;
    }
    setError(undefined);
    forgot.mutate(email);
  };

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('auth.forgotTitle')}</h1>
      {forgot.isSuccess ? (
        <div className={styles.notice}>
          <MailCheck size={40} color="var(--grass)" />
          <p>{t('auth.forgotSent')}</p>
          <Link to="/login" className={styles.link}>
            {t('auth.toLogin')}
          </Link>
        </div>
      ) : (
        <>
          <p className={styles.subtitle}>{t('auth.forgotSubtitle')}</p>
          <form className={styles.form} onSubmit={submit} noValidate>
            {forgot.error && <FormError>{errorMessage(forgot.error, t)}</FormError>}
            <Field label={t('auth.email')} error={error}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            <Button type="submit" size="lg" block loading={forgot.isPending}>
              {t('auth.forgotSubmit')}
            </Button>
          </form>
          <p className={styles.footer}>
            <Link to="/login" className={styles.link}>
              {t('common.back')}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
