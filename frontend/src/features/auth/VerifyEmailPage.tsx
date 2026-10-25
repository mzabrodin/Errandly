import { CircleCheck } from 'lucide-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { useVerifyEmail } from '../../shared/api/auth';
import { getPendingInvite } from '../../shared/lib/pendingInvite';
import { ButtonLink } from '../../shared/ui/Button';
import { FormError } from '../../shared/ui/Field';
import { Spinner } from '../../shared/ui/Spinner';
import styles from './auth.module.css';

export function VerifyEmailPage(): JSX.Element {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const verify = useVerifyEmail();
  const started = useRef(false);
  const [pendingInvite] = useState(getPendingInvite);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('auth.verifyTitle')}</h1>
      <div className={styles.notice}>
        {verify.isPending && (
          <p>
            <Spinner size={18} /> {t('auth.verifyPending')}
          </p>
        )}
        {verify.isSuccess && (
          <>
            <CircleCheck size={40} color="var(--grass)" />
            {pendingInvite !== null && pendingInvite !== '' ? (
              <>
                <p>{t('auth.verifyDoneInvite')}</p>
                <ButtonLink to={`/invite/${pendingInvite}`}>{t('auth.backToInvite')}</ButtonLink>
              </>
            ) : (
              <>
                <p>{t('auth.verifyDone')}</p>
                <ButtonLink to="/app">{t('groups.create')}</ButtonLink>
              </>
            )}
          </>
        )}
        {verify.isError && (
          <>
            <FormError>{t('auth.errors.tokenInvalid')}</FormError>
            <Link to="/app" className={styles.link}>
              {t('common.back')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
