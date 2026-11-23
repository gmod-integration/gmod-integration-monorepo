import { getEmojis } from 'unicode-emoji'
import { ConfigDiscord } from '@gmod/config'
import prisma from '@gmod/infra-prisma'
import { type Request, type Response } from 'express'
import { isIP } from 'node:net'

export function getRandomDiscordRelay() {
  return ConfigDiscord.relayUrl
}

export function getEmojiVersion(emoji: string) {
  const emojis = getEmojis()
  const emojiData = emojis.find((e) => e.emoji === emoji)
  if (emojiData) {
    return emojiData.version
  } else {
    return null
  }
}

const currenciesByLang = [
  { lang: 'bg', currency: 'BGN' }, // Bulgarian Lev
  { lang: 'zh-CN', currency: 'CNY' }, // Chinese Yuan
  { lang: 'zh-TW', currency: 'TWD' }, // New Taiwan Dollar
  { lang: 'hr', currency: 'HRK' }, // Croatian Kuna
  { lang: 'cs', currency: 'CZK' }, // Czech Koruna
  { lang: 'da', currency: 'DKK' }, // Danish Krone
  { lang: 'nl', currency: 'EUR' }, // Euro
  { lang: 'en-GB', currency: 'GBP' }, // British Pound Sterling
  { lang: 'en-US', currency: 'USD' }, // United States Dollar
  { lang: 'fi', currency: 'EUR' }, // Euro
  { lang: 'fr', currency: 'EUR' }, // Euro
  { lang: 'de', currency: 'EUR' }, // Euro
  { lang: 'el', currency: 'EUR' }, // Euro
  { lang: 'hi', currency: 'INR' }, // Indian Rupee
  { lang: 'hu', currency: 'HUF' }, // Hungarian Forint
  { lang: 'id', currency: 'IDR' }, // Indonesian Rupiah
  { lang: 'it', currency: 'EUR' }, // Euro
  { lang: 'ja', currency: 'JPY' }, // Japanese Yen
  { lang: 'ko', currency: 'KRW' }, // South Korean Won
  { lang: 'lt', currency: 'EUR' }, // Euro
  { lang: 'no', currency: 'NOK' }, // Norwegian Krone
  { lang: 'pl', currency: 'PLN' }, // Polish Złoty
  { lang: 'pt-BR', currency: 'BRL' }, // Brazilian Real
  { lang: 'ro', currency: 'RON' }, // Romanian Leu
  { lang: 'ru', currency: 'RUB' }, // Russian Ruble
  { lang: 'es-ES', currency: 'EUR' }, // Euro
  { lang: 'es-419', currency: 'USD' }, // United States Dollar (commonly used in Latin America)
  { lang: 'sv-SE', currency: 'SEK' }, // Swedish Krona
  { lang: 'th', currency: 'THB' }, // Thai Baht
  { lang: 'tr', currency: 'TRY' }, // Turkish Lira
  { lang: 'uk', currency: 'UAH' }, // Ukrainian Hryvnia
  { lang: 'vi', currency: 'VND' }, // Vietnamese Đồng
] as const

export function getCurrencyByLang(lang: string) {
  const currency = currenciesByLang.find((c) => c.lang === lang)
  if (currency) {
    return currency.currency
  } else {
    return 'USD' // Default to USD if language not found
  }
}

export function badArgument(list: any[]) {
  let valid = true
  const failedArg = []

  for (let i = 0; i < list.length; i++) {
    if (list[i] === undefined) {
      valid = false
      failedArg.push(i)
    }
  }

  if (!valid) {
    return failedArg.join(', ')
  }

  return false
}

export function ipGetIP(ip: string) {
  if (isIP(ip)) return ip
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
  if (bracketed && isIP(bracketed[1])) return bracketed[1]
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1]
  return ip
}

export async function addNotification(discordID: string, type: string, message: string) {
  // TODO send notification to websocket for webpanel user
  await prisma.gm_users_notifications.create({
    data: {
      discordID,
      type,
      message,
    },
  })
}

export function todoControllers(req: Request, res: Response) {
  return res.status(501).send({
    error: 'Not Implemented',
  })
}

async function fetchLastTag() {
  return await fetch('https://api.github.com/repos/gmod-integration/gmod-integration/tags')
    .then((response) => response.json())
    .then((data) => {
      return data[0].name
    })
    .catch((error) => {
      console.error('Error:', error)
      return 'Unknown'
    })
}

// update every 10 min
export let lastGmodIntegrationTag = await fetchLastTag()
setInterval(
  async () => {
    lastGmodIntegrationTag = await fetchLastTag()
  },
  1000 * 60 * 10,
)

/*
 * Compare two versions
 * @param {string} version1
 * @param {string} version2
 * @returns {number} 1 if version1 > version2, -1 if version1 < version2, 0 if version1 === version2
 * @example
 * versionComparator('1.0.0', '1.0.1') // -1
 * versionComparator('1.0.1', '1.0.0') // 1
 * versionComparator('1.0.0', '1.0.0') // 0
 */
export function versionComparator(version1: string, version2: string) {
  const parse = (value: string) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)
    if (!match) return null
    const parts = match.slice(1).map(Number)
    return parts.every(Number.isSafeInteger) ? parts : null
  }
  const v1 = parse(version1)
  const v2 = parse(version2)
  if (!v1 || !v2) return 0

  for (let i = 0; i < v1.length; i++) {
    if (v1[i] > v2[i]) {
      return 1
    } else if (v1[i] < v2[i]) {
      return -1
    }
  }

  return 0
}
