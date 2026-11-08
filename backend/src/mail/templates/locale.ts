// Emails go out in the recipient's account language (the same languages as the frontend UI)
export const MAIL_LOCALES = ['uk', 'en'] as const;
export type MailLocale = (typeof MAIL_LOCALES)[number];

export const DEFAULT_MAIL_LOCALE: MailLocale = 'uk';

export function isMailLocale(value: unknown): value is MailLocale {
  return typeof value === 'string' && MAIL_LOCALES.some((locale) => locale === value);
}

/** Text shared by every email: header, footer and the plain-text fallback */
export interface LayoutCopy {
  /** BCP 47 tag for <html lang> and Intl date formatting */
  intlLocale: string;
  tagline: string;
  difficulty: string;
  buttonFallback: string;
  manageNotifications: string;
  footer: string;
}

export const layoutCopy: Record<MailLocale, LayoutCopy> = {
  uk: {
    intlLocale: 'uk-UA',
    tagline: 'побут для всіх, хто живе разом',
    difficulty: 'складність',
    buttonFallback: 'Кнопка не працює? Скопіюйте посилання в браузер:',
    manageNotifications: 'Налаштувати сповіщення',
    footer: 'Errandly · навчальний проєкт НаУКМА',
  },
  en: {
    intlLocale: 'en-GB',
    tagline: 'chores for everyone who lives together',
    difficulty: 'difficulty',
    buttonFallback: 'Button not working? Copy the link into your browser:',
    manageNotifications: 'Manage notifications',
    footer: 'Errandly · a NaUKMA student project',
  },
};
