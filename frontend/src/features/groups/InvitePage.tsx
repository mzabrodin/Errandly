import { useEffect, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';

import { useResendVerification, useSession } from '../../shared/api/auth';
import { errorMessage, isApiError } from '../../shared/api/errors';
import { useAcceptInvite, useInviteInfo } from '../../shared/api/groups';
import { forgetInvite, rememberInvite } from '../../shared/lib/pendingInvite';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { FormError } from '../../shared/ui/Field';
import { PageSpinner } from '../../shared/ui/Spinner';
import { useToast } from '../../shared/ui/Toast';
import styles from '../auth/auth.module.css';

export function InvitePage(): JSX.Element {
  const { t } = useTranslation();
  useDocumentTitle(t('titles.invite'));
  const toast = useToast();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { data: user, isPending: sessionPending } = useSession();
  const info = useInviteInfo(token, !sessionPending);
  const accept = useAcceptInvite();
  const resend = useResendVerification();
  const next = encodeURIComponent(`/invite/${token}`);
  const needsVerification = Boolean(user && !user.emailVerified);

  useEffect(() => {
    if (needsVerification) rememberInvite(token);
  }, [needsVerification, token]);

  if (sessionPending || info.isPending) return <PageSpinner label={t('common.loading')} />;

  // прострочене або відкликане запрошення (FR-13)
  if (info.error) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{t('invite.invalidTitle')}</h1>
        <p className={styles.subtitle}>
          {isApiError(info.error, 'INVITE_INVALID')
            ? t('invite.invalidText')
            : errorMessage(info.error, t)}
        </p>
        <div className={styles.notice}>
          <ButtonLink to={user ? '/app' : '/'} variant="secondary">
            {t('common.back')}
          </ButtonLink>
        </div>
      </div>
    );
  }

  // уже учасник — просто відкриваємо групу без дубліката (FR-14)
  if (info.data.alreadyMember) return <Navigate to={`/g/${info.data.groupId}/tasks`} replace />;

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('invite.title')}</h1>
      <p className={styles.subtitle}>
        {t('invite.text', {
          name: info.data.invitedBy,
          group: info.data.groupName,
        })}
      </p>

      {user && !user.emailVerified ? (
        // без підтвердженого email приєднатися не можна (FR-04) — пояснюємо, як повернутися
        <div className={styles.form}>
          <p>{t('invite.verifyFirst', { email: user.email })}</p>
          <Button
            variant="secondary"
            block
            loading={resend.isPending}
            onClick={() =>
              resend.mutate(undefined, {
                onSuccess: () => toast(t('auth.verifyResent')),
              })
            }
          >
            {t('auth.verifyResend')}
          </Button>
        </div>
      ) : user ? (
        <div className={styles.form}>
          {accept.error && (
            <FormError>
              {isApiError(accept.error, 'EMAIL_NOT_VERIFIED')
                ? t('groups.needVerify')
                : errorMessage(accept.error, t)}
            </FormError>
          )}
          <Button
            size="lg"
            block
            loading={accept.isPending}
            onClick={() =>
              accept.mutate(token, {
                onSuccess: ({ groupId }) => {
                  forgetInvite();
                  toast(t('invite.joined', { group: info.data.groupName }));
                  void navigate(`/g/${groupId}/tasks`, { replace: true });
                },
              })
            }
          >
            {t('invite.accept')}
          </Button>
        </div>
      ) : (
        // гість: після входу чи реєстрації повертаємося сюди (FR-12)
        <div className={styles.form}>
          <p>{t('invite.needAuth')}</p>
          <ButtonLink to={`/register?next=${next}`} size="lg" block>
            {t('auth.toRegister')}
          </ButtonLink>
          <ButtonLink to={`/login?next=${next}`} variant="secondary" size="lg" block>
            {t('auth.toLogin')}
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
