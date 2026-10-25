import { Check, Copy, Link2, Send } from 'lucide-react';
import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../shared/api/errors';
import { useCreateInvite } from '../../shared/api/groups';
import { formatShortDate } from '../../shared/lib/dates';
import { isValidEmail } from '../../shared/lib/validation';
import { Button } from '../../shared/ui/Button';
import { Field, FormError, Input } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { useToast } from '../../shared/ui/Toast';
import styles from './InviteModal.module.css';

export function InviteModal({
  groupId,
  open,
  onClose,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const linkInvite = useCreateInvite(groupId);
  const emailInvite = useCreateInvite(groupId);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!linkInvite.data) return;
    try {
      await navigator.clipboard.writeText(linkInvite.data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер обміну недоступний — посилання можна виділити вручну
    }
  };

  const sendEmail = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidEmail(email)) return setEmailError(t('auth.errors.emailInvalid'));
    setEmailError(undefined);
    emailInvite.mutate(email, {
      onSuccess: () => {
        toast(t('groups.inviteEmailSent', { email }));
        setEmail('');
      },
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={t('groups.inviteTitle')}>
      <div className={styles.body}>
        <section className={styles.section}>
          <h3 className={styles.label}>{t('groups.inviteLinkLabel')}</h3>
          {linkInvite.data ? (
            <>
              <div className={styles.linkRow}>
                <Input
                  readOnly
                  value={linkInvite.data.url}
                  onFocus={(event) => event.target.select()}
                  aria-label={t('groups.inviteLinkLabel')}
                />
                <Button
                  variant="lime"
                  icon={copied ? <Check size={18} /> : <Copy size={18} />}
                  onClick={() => void copy()}
                >
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
              <p className={styles.hint}>
                {t('groups.inviteLinkHint', {
                  date: formatShortDate(linkInvite.data.expiresAt),
                })}
              </p>
            </>
          ) : (
            <Button
              variant="secondary"
              icon={<Link2 size={18} />}
              loading={linkInvite.isPending}
              onClick={() => linkInvite.mutate(undefined)}
            >
              {t('groups.inviteGenerate')}
            </Button>
          )}
          {linkInvite.error && <FormError>{errorMessage(linkInvite.error, t)}</FormError>}
        </section>

        <form className={styles.section} onSubmit={sendEmail} noValidate>
          <Field label={t('groups.inviteEmailLabel')} error={emailError}>
            {(props) => (
              <div className={styles.linkRow}>
                <Input
                  {...props}
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Button type="submit" icon={<Send size={16} />} loading={emailInvite.isPending}>
                  {t('groups.inviteEmailSend')}
                </Button>
              </div>
            )}
          </Field>
          {emailInvite.error && <FormError>{errorMessage(emailInvite.error, t)}</FormError>}
        </form>
      </div>
    </Modal>
  );
}
