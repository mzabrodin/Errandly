import { Camera, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../shared/api/errors';
import { useRemoveAvatar, useUploadAvatar } from '../../shared/api/profile';
import type { User } from '../../shared/api/types';
import { ImageError, prepareAvatar } from '../../shared/lib/image';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Spinner } from '../../shared/ui/Spinner';
import { useToast } from '../../shared/ui/Toast';
import styles from './AvatarEditor.module.css';

/** Фото профілю: завантажити, замінити або видалити (повертаються ініціали) */
export function AvatarEditor({
  user,
  children,
}: {
  user: User;
  children?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || upload.isPending || remove.isPending;
  const hasPhoto = user.avatarUrl !== null && user.avatarUrl !== '';

  const pick = () => inputRef.current?.click();

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // дозволяємо обрати той самий файл ще раз
    event.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      const image = await prepareAvatar(file);
      upload.mutate(image, {
        onSuccess: () => toast(t('settings.avatar.saved')),
        onError: (uploadError) => toast(errorMessage(uploadError, t), 'error'),
      });
    } catch (prepareError) {
      const code = prepareError instanceof ImageError ? prepareError.code : 'decode';
      toast(t(`settings.avatar.errors.${code}`), 'error');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className={styles.editor}>
      <button
        type="button"
        className={styles.photo}
        onClick={pick}
        disabled={busy}
        aria-label={hasPhoto ? t('settings.avatar.change') : t('settings.avatar.upload')}
      >
        <Avatar name={user.name} src={user.avatarUrl} color="var(--lime)" size={84} />
        <span className={styles.overlay} aria-hidden>
          {busy ? <Spinner size={22} /> : <Camera size={22} />}
        </span>
      </button>
      <div className={styles.side}>
        {children}
        <div className={styles.actions}>
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload size={15} />}
            onClick={pick}
            disabled={busy}
          >
            {hasPhoto ? t('settings.avatar.change') : t('settings.avatar.upload')}
          </Button>
          {hasPhoto && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={15} />}
              loading={remove.isPending}
              disabled={busy}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast(t('settings.avatar.removed')),
                })
              }
            >
              {t('settings.avatar.remove')}
            </Button>
          )}
          <span className={styles.hint}>{t('settings.avatar.hint')}</span>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void onFile(event)}
      />
    </div>
  );
}
