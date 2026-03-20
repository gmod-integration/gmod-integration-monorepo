import steamApi from 'steamapi'
import { ConfigSteam } from '@gmod/config'
import { ensureAvatarStored } from '@gmod/infra-minio'

const steam = new steamApi(ConfigSteam.apiKey!)

export function getSteamApi() {
  return steam
}

export function getSteamUserSummary(steamID64: string) {
  return new Promise(async (resolve, reject) => {
    const summary = await steam.getUserSummary(steamID64)
    resolve(summary)
  })
}

export function getSteamUserAvatars(steamID64: string) {
  return new Promise(async (resolve, reject) => {
    const summary = await steam.getUserSummary(steamID64)
    resolve(summary.avatar)
  })
}

export function getSteamUserAvatarLarge(steamID64: string) {
  return new Promise(async (resolve, reject) => {
    const summary = await steam.getUserSummary(steamID64)
    resolve(await ensureAvatarStored('steam', steamID64, summary.avatar.large))
  })
}
