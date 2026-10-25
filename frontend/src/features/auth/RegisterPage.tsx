import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';

import { useRegister } from '../../shared/api/auth';
import { errorMessage, isApiError } from '../../shared/api/errors';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { isValidEmail, isValidPassword } from '../../shared/lib/validation';
import { Button } from '../../shared/ui/Button';
import { Field, FormError, Input } from '../../shared/ui/Field';
import styles from './auth.module.css';
import { GoogleButton } from './GoogleButton';
import { PasswordInput } from './PasswordInput';
import { PasswordRules } from './PasswordRules';
import { useNextPath } from './useNextPath';

interface Errors {
  name?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

export function RegisterPage(): JSX.Element {
  const { t } = useTranslation();
  useDocumentTitle(t('titles.register'));
  const navigate = useNavigate();
  const { search } = useLocation();
  const next = useNextPath();
  const register = useRegister();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  const update = (field: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    // помилка підсвічує лише своє поле, інші поля не очищаються (FR-03)
    const nextErrors: Errors = {
      name: form.name.trim() !== '' ? undefined : t('auth.errors.nameRequired'),
      email: isValidEmail(form.email) ? undefined : t('auth.errors.emailInvalid'),
      password: isValidPassword(form.password) ? undefined : t('auth.errors.passwordWeak'),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    register.mutate(form, {
      onSuccess: () => void navigate(next, { replace: true }),
    });
  };

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('auth.registerTitle')}</h1>
      <p className={styles.subtitle}>{t('auth.registerSubtitle')}</p>

      <form className={styles.form} onSubmit={submit} noValidate>
        {register.error &&
          (isApiError(register.error, 'EMAIL_TAKEN') ? (
            <FormError>
              {t('auth.errors.emailTaken')}{' '}
              <Link to={`/login${search}`} className={styles.link}>
                {t('auth.toLogin')}
              </Link>{' '}
              ·{' '}
              <Link to="/forgot-password" className={styles.link}>
                {t('auth.forgot')}
              </Link>
            </FormError>
          ) : (
            <FormError>{errorMessage(register.error, t)}</FormError>
          ))}
        <Field label={t('auth.name')} error={errors.name}>
          {(props) => (
            <Input
              {...props}
              autoComplete="name"
              placeholder={t('auth.namePlaceholder')}
              value={form.name}
              onChange={(event) => update('name')(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('auth.email')} error={errors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              value={form.email}
              onChange={(event) => update('email')(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('auth.password')} error={errors.password}>
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => update('password')(event.target.value)}
            />
          )}
        </Field>
        <PasswordRules password={form.password} showErrors={submitted} />
        <Button type="submit" size="lg" block loading={register.isPending}>
          {t('auth.registerSubmit')}
        </Button>
        <div className={styles.divider}>{t('auth.or')}</div>
        <GoogleButton next={next} />
      </form>

      <p className={styles.footer}>
        {t('auth.haveAccount')}{' '}
        <Link to={`/login${search}`} className={styles.link}>
          {t('auth.toLogin')}
        </Link>
      </p>
    </div>
  );
}
