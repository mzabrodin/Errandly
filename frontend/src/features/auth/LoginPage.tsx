import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';

import { useLogin } from '../../shared/api/auth';
import { errorMessage, isApiError } from '../../shared/api/errors';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { isValidEmail } from '../../shared/lib/validation';
import { Button } from '../../shared/ui/Button';
import { Field, FormError, Input } from '../../shared/ui/Field';
import styles from './auth.module.css';
import { GoogleButton } from './GoogleButton';
import { PasswordInput } from './PasswordInput';
import { useNextPath } from './useNextPath';

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  useDocumentTitle(t('titles.login'));
  const navigate = useNavigate();
  const { search } = useLocation();
  const next = useNextPath();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    email?: string | undefined;
    password?: string | undefined;
  }>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = {
      email: isValidEmail(email) ? undefined : t('auth.errors.emailInvalid'),
      password: password !== '' ? undefined : t('auth.errors.passwordRequired'),
    };
    setErrors(nextErrors);
    if (nextErrors.email !== undefined || nextErrors.password !== undefined) return;
    login.mutate({ email, password }, { onSuccess: () => void navigate(next, { replace: true }) });
  };

  const serverError = (() => {
    if (!login.error) return null;
    // загальне повідомлення, не уточнюючи, яке поле хибне (FR-05)
    if (isApiError(login.error, 'INVALID_CREDENTIALS')) return t('auth.errors.invalidCredentials');
    if (isApiError(login.error, 'ACCOUNT_LOCKED')) {
      const minutes = Math.ceil((login.error.details.retryAfterSeconds ?? 900) / 60);
      return t('auth.errors.locked', { minutes });
    }
    return errorMessage(login.error, t);
  })();

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('auth.loginTitle')}</h1>
      <p className={styles.subtitle}>{t('auth.loginSubtitle')}</p>

      <form className={styles.form} onSubmit={submit} noValidate>
        {serverError !== null && <FormError>{serverError}</FormError>}
        <Field label={t('auth.email')} error={errors.email}>
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
        <Field label={t('auth.password')} error={errors.password}>
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <div className={styles.row}>
          <Link to="/forgot-password" className={styles.link}>
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={login.isPending}>
          {t('auth.loginSubmit')}
        </Button>
        <div className={styles.divider}>{t('auth.or')}</div>
        <GoogleButton next={next} />
      </form>

      <p className={styles.footer}>
        {t('auth.noAccount')}{' '}
        <Link to={`/register${search}`} className={styles.link}>
          {t('auth.toRegister')}
        </Link>
      </p>
    </div>
  );
}
