import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useSession } from '../../shared/api/auth';
import { errorMessage } from '../../shared/api/errors';
import { useCreateGroup, useGroups } from '../../shared/api/groups';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { Button } from '../../shared/ui/Button';
import { Asterisk } from '../../shared/ui/Decor';
import { Field, FormError, Input } from '../../shared/ui/Field';
import { useToast } from '../../shared/ui/Toast';
import styles from './CreateGroupPage.module.css';

export function CreateGroupPage(): JSX.Element {
  const { t } = useTranslation();
  useDocumentTitle(t('titles.newGroup'));
  const navigate = useNavigate();
  const toast = useToast();
  const { data: user } = useSession();
  const { data: groups } = useGroups();
  const create = useCreateGroup();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const verified = user?.emailVerified ?? false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return setError(t('groups.nameRequired'));
    if (name.trim().length > 50) return setError(t('groups.nameTooLong'));
    setError(undefined);
    create.mutate(name.trim(), {
      onSuccess: (group) => {
        toast(t('groups.created'));
        // одразу ведемо до запрошення співмешканців (NFR-USE-01)
        void navigate(`/g/${group.id}/members?invite=1`);
      },
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Asterisk className={styles.star} size={44} color="var(--grass)" />
        <h1 className={styles.title}>
          {groups !== undefined && groups.length > 0
            ? t('groups.createTitle')
            : t('groups.noGroupsTitle')}
        </h1>
        <p className={styles.subtitle}>{t('groups.createSubtitle')}</p>
        <form className={styles.form} onSubmit={submit} noValidate>
          {!verified && <FormError>{t('groups.needVerify')}</FormError>}
          {create.error && <FormError>{errorMessage(create.error, t)}</FormError>}
          <Field label={t('groups.name')} error={error}>
            {(props) => (
              <Input
                {...props}
                maxLength={50}
                placeholder={t('groups.namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- єдине поле форми, фокус очікуваний
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" size="lg" block loading={create.isPending} disabled={!verified}>
            {t('groups.create')}
          </Button>
        </form>
      </div>
    </div>
  );
}
