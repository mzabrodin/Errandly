import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '../../shared/ui/Field';
import styles from './auth.module.css';

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.passwordWrap}>
      <Input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className={styles.eye}
        onClick={() => setVisible((value) => !value)}
        aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
