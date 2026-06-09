import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh.json'
import en from './locales/en.json'

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('lang') : null

const browserLang = typeof navigator !== 'undefined' ? navigator?.language || '' : ''
const isChinese = browserLang === 'zh' || browserLang === 'zh-CN' || browserLang.startsWith('zh-CN')

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: savedLang || (isChinese ? 'zh' : 'en'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: 'zh' | 'en') {
  i18n.changeLanguage(lang)
  localStorage.setItem('lang', lang)
}

export default i18n
