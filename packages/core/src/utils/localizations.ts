import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'node:url'
import redis from '@gmod/infra-redis'
import { gmLog } from '@gmod/shared/logger.js'

const localesDirectory = fileURLToPath(new URL('../../../locales/', import.meta.url))

function insertOptions(str: string, options?: string[]): string {
  if (!options) return str

  for (let i = 0; i < options.length; i++) {
    str = str.replace(`{${i + 1}}`, options[i])
  }

  return str
}

function getDefaultTrad(key: string, options?: string[]): string {
  try {
    const defaultLanguage = JSON.parse(readFileSync(join(localesDirectory, 'en.json'), 'utf8'))

    if (key in defaultLanguage) {
      return insertOptions(defaultLanguage[key], options)
    } else {
      console.error(
        `Missing key ${key} in default language` + (options ? ` with the options ${options.join(', ')}` : ''),
      )
      return key + (options ? ` - ${options.join(', ')}` : '')
    }
  } catch (error: any) {
    console.error(`Error in getDefaultTrad: ${error.message}`)
    return key + (options ? ` - ${options.join(', ')}` : '')
  }
}

export async function getTranslate(key: string, language?: string, options?: string[]) {
  language = language ? language.substring(0, 2) : 'en'

  const redisKey = `language:${language}:${key}`
  const cachedTranslation = await redis.get(redisKey)
  if (cachedTranslation !== null) {
    return insertOptions(cachedTranslation, options)
  }

  try {
    let filePath = join(localesDirectory, `${language}.json`)

    if (!existsSync(filePath)) {
      filePath = join(localesDirectory, 'en.json')
    }

    const translate = JSON.parse(readFileSync(filePath, 'utf8'))
    if (key in translate) {
      await redis.set(redisKey, translate[key], 'EX', 60 * 60 * 24)
      return insertOptions(translate[key], options)
    } else {
      return getDefaultTrad(key, options)
    }
  } catch (error: any) {
    gmLog('localization', `Error in await getTranslate: ${error.message}`)
    return getDefaultTrad(key, options)
  }
}
