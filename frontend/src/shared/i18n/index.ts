import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uk from './locales/uk.json';

// Тексти інтерфейсу зберігаються окремо від коду (NFR-USE-03)
void i18n.use(initReactI18next).init({
  resources: { uk: { translation: uk } },
  lng: 'uk',
  fallbackLng: 'uk',
  interpolation: { escapeValue: false },
});

export default i18n;
