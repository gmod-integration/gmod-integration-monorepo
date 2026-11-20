import { createContext, createEffect, createSignal, useContext, type Accessor, type ParentComponent } from 'solid-js'

import en from './locales/en.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import es from './locales/es.json'
import it from './locales/it.json'
import pl from './locales/pl.json'
import nl from './locales/nl.json'
import ru from './locales/ru.json'
import tr from './locales/tr.json'
import { DEV_SHOW_MISSING_TRANSLATIONS, isDevEnvironment } from './utils/utils.js'

const translations = {
  en,
  fr,
  de,
  es,
  it,
  nl,
  pl,
  ru,
  tr,
}

export type Locale = keyof typeof translations

type I18nContextValue = {
  t: (key: string, defaultText?: string, ...args: unknown[]) => string
  locale: Accessor<Locale>
  updateLocale: (newLocale: string) => void
}

const I18nContext = createContext<I18nContextValue>()

const isLocale = (value: string | null): value is Locale =>
  value !== null && Object.prototype.hasOwnProperty.call(translations, value)

const getNestedTranslation = (dictionary: unknown, key: string): string | undefined => {
  let value: unknown = dictionary
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return
    value = Reflect.get(value, part)
  }
  return typeof value === 'string' ? value : undefined
}

export const I18nProvider: ParentComponent = (props) => {
  let storedLocale: string | null = null
  try {
    storedLocale = localStorage.getItem('locale')
  } catch {
    // A browser that blocks storage still gets a usable default language.
  }
  const [locale, setLocale] = createSignal<Locale>(isLocale(storedLocale) ? storedLocale : 'en')
  createEffect(() => {
    document.documentElement.lang = locale()
  })

  const t: I18nContextValue['t'] = (key, defaultText, ...args) => {
    let translation = getNestedTranslation(translations[locale()], key)
    if (!translation && locale() !== 'en') {
      translation = getNestedTranslation(translations['en'], key)
    }
    if (!translation) {
      console.warn(`Translation for key "${key}" not found in locale "${locale()}"`)
    } else {
      if (args.length) {
        args.forEach((arg, index) => {
          translation = translation?.replaceAll(`{${index + 1}}`, () => String(arg))
        })
      }
    }
    if (isDevEnvironment() && DEV_SHOW_MISSING_TRANSLATIONS) {
      defaultText = `💥💥 - ${defaultText} - ${key} - 💥💥`
    }
    return translation || defaultText || key
  }

  const updateLocale = (newLocale: string) => {
    if (!isLocale(newLocale)) {
      return
    }
    try {
      localStorage.setItem('locale', newLocale)
    } catch {
      // Keep the language choice active for this tab when it cannot be persisted.
    }
    setLocale(newLocale)
  }

  return <I18nContext.Provider value={{ t, locale, updateLocale }}>{props.children}</I18nContext.Provider>
}

export const useI18n = () => {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }

  return context
}
