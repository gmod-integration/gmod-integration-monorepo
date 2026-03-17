import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function insertOptions(str: string, options?: string[]): string {
  if (!options) return str

  for (let i = 0; i < options.length; i += 1) {
    str = str.replace(`{${i + 1}}`, options[i])
  }

  return str
}

function getDefaultTrad(key: string, options?: string[]): string {
  try {
    const defaultLanguage = JSON.parse(readFileSync(join(process.cwd(), 'packages/locales/en.json'), 'utf8'))

    if (key in defaultLanguage) {
      return insertOptions(defaultLanguage[key], options)
    }

    return key + (options ? ` - ${options.join(', ')}` : '')
  } catch {
    return key + (options ? ` - ${options.join(', ')}` : '')
  }
}

export async function getTranslate(key: string, language?: string, options?: string[]) {
  const shortLanguage = language ? language.substring(0, 2) : 'en'

  try {
    let filePath = join(process.cwd(), `packages/locales/${shortLanguage}.json`)

    if (!existsSync(filePath)) {
      filePath = join(process.cwd(), 'packages/locales/en.json')
    }

    const translate = JSON.parse(readFileSync(filePath, 'utf8'))
    if (key in translate) {
      return insertOptions(translate[key], options)
    }

    return getDefaultTrad(key, options)
  } catch {
    return getDefaultTrad(key, options)
  }
}
