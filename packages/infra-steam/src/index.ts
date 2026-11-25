import steamApi from 'steamapi'
import { ConfigSteam } from '@gmod/config'
import { ensureAvatarStored } from '@gmod/infra-minio'

const steam = new steamApi(ConfigSteam.apiKey!)

export function getSteamApi() {
  return steam
}

export async function getSteamUserSummary(steamID64: string) {
  return steam.getUserSummary(steamID64)
}

export async function getSteamUserAvatars(steamID64: string) {
  const summary = await steam.getUserSummary(steamID64)
  return summary.avatar
}

export async function getSteamUserAvatarLarge(steamID64: string) {
  const summary = await steam.getUserSummary(steamID64)
  return ensureAvatarStored('steam', steamID64, summary.avatar.large)
}
