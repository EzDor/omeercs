import { createI18n } from 'vue-i18n';
import en from './locales/en';

const messages = {
  en,
};

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages,
  globalInjection: true,
});

export default i18n;
