import { useEffect } from 'react';

import { useSession } from '../shared/api/auth';
import { changeLocale } from '../shared/i18n';

/** The signed-in user's account language wins over the one remembered in this browser */
export function LocaleSync(): null {
  const { data: user } = useSession();
  const locale = user?.locale;

  useEffect(() => {
    if (locale !== undefined) void changeLocale(locale);
  }, [locale]);

  return null;
}
