import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { gmLog } from './logger.js';

function insertOptions(str, options) {
  if (!options) return str;

  for (let i = 0; i < options.length; i++) {
    str = str.replace(`{${i + 1}}`, options[i]);
  }

  return str;
}

function getDefaultTrad(key, options) {
  try {
    const defaultLanguage = JSON.parse(readFileSync(join(process.cwd(), 'src/locales/en.json'), 'utf8'));

    if (key in defaultLanguage) {
      return insertOptions(defaultLanguage[key], options);
    } else {
      console.error(
        `Missing key ${key} in default language` + (options ? ` with the options ${options.join(', ')}` : ''),
      );
      return key;
    }
  } catch (error) {
    console.error(`Error in getDefaultTrad: ${error.message}`);
    return key;
  }
}

export function getTranslate(key, language, options) {
  try {
    let filePath = join(process.cwd(), `src/locales/${language ? language.substring(0, 2) : 'en'}.json`);

    if (!existsSync(filePath)) {
      filePath = join(process.cwd(), 'src/locales/en.json');
    }

    const translate = JSON.parse(readFileSync(filePath, 'utf8'));
    if (key in translate) {
      return insertOptions(translate[key], options);
    } else {
      return getDefaultTrad(key, options);
    }
  } catch (error) {
    gmLog('localization', `Error in getTranslate: ${error.message}`);
    return getDefaultTrad(key, options);
  }
}
