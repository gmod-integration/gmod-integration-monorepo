import { createContext, createSignal, useContext } from "solid-js";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import pl from "./locales/pl.json";
import nl from "./locales/nl.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";
import { DEV_SHOW_MISSING_TRANSLATIONS, isDevEnvironment } from "./utils/utils";

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
};

const I18nContext = createContext();

const getNestedTranslation = (obj, key) => {
  return key.split(".").reduce((o, i) => (o ? o[i] : null), obj);
};

export const I18nProvider = (props) => {
  const [locale, setLocale] = createSignal(localStorage.getItem("locale") || "en");

  const t = (key: string, defaultText: any, ...args: any) => {
    let translation = getNestedTranslation(translations[locale()], key);
    if (!translation && locale() !== "en") {
      translation = getNestedTranslation(translations["en"], key);
    }
    if (!translation) {
      console.warn(`Translation for key "${key}" not found in locale "${locale()}"`);
    } else {
      if (args.length) {
        args.forEach((arg, index) => {
          translation = translation.replace(new RegExp(`\\{${index + 1}\\}`, "g"), arg);
        });
      }
    }
    if (isDevEnvironment() && DEV_SHOW_MISSING_TRANSLATIONS) {
      defaultText = `💥💥 - ${defaultText} - ${key} - 💥💥`;
    }
    return translation || defaultText || key;
  };

  const updateLocale = (newLocale) => {
    if (!translations[newLocale]) {
      return;
    }
    localStorage.setItem("locale", newLocale);
    setLocale(newLocale);
  };

  return <I18nContext.Provider value={{ t, locale, updateLocale }}>{props.children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }

  return context as {
    t: (key: string, defaultText: any, ...args: any) => string;
    locale: any;
    updateLocale: (newLocale: string) => void;
  };
};
