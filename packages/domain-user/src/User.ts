import prisma from '@gmod/infra-prisma'
import { getPlatformRank, isDeveloper } from '@gmod/config/developers.js'
import { isErasureBlocked } from './privacy.js'

export class User {
  steamID64: string | null
  discordID: string
  rank: string
  lastVerification: Date | null
  trustLevel: number

  constructor({
    steamID64,
    discordID,
    lastVerification,
    trustLevel,
  }: {
    steamID64: string | null
    discordID: string
    rank?: string
    lastVerification: Date | null
    trustLevel: number
  }) {
    this.steamID64 = steamID64
    this.discordID = discordID
    this.rank = getPlatformRank(discordID)
    this.lastVerification = lastVerification
    this.trustLevel = trustLevel
  }

  getDiscordID() {
    return this.discordID
  }

  getSteamID64() {
    return this.steamID64
  }

  isDeveloper() {
    return isDeveloper(this.discordID)
  }
}

export async function getUserFromSteamID64(steamID64: string) {
  const user = await prisma.gm_user.findFirst({
    where: {
      steam: steamID64,
    },
  })

  if (!user) return null
  if (await isErasureBlocked(user.id, user.steam)) return null

  return new User({
    steamID64: user.steam,
    discordID: user.id,
    rank: user.rank,
    lastVerification: user.last_oauth,
    trustLevel: user.trust ?? 50,
  })
}

export async function getUserFromDiscordID(discordID: string) {
  const user = await prisma.gm_user.findFirst({
    where: {
      id: discordID,
    },
  })

  if (!user) return null
  if (await isErasureBlocked(user.id, user.steam)) return null

  return new User({
    steamID64: user.steam,
    discordID: user.id,
    rank: user.rank,
    lastVerification: user.last_oauth,
    trustLevel: user.trust ?? 50,
  })
}
