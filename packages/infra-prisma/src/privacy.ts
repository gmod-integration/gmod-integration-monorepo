import { createHmac } from 'node:crypto'
import { ConfigDiscord, ConfigPrivacy } from '@gmod/config'
import prisma from './index.js'

export type PrivacyProvider = 'discord' | 'steam'

/** Legacy deployments may stage the code before applying the optional erasure migration. */
export function hasPrivacyHashSecret(): boolean {
  return !!ConfigPrivacy.hashSecret
}

/** Stable, provider-scoped lookup key; never store a plain hash of enumerable account IDs. */
export function privacySubject(provider: PrivacyProvider, id: string): string {
  return createHmac('sha256', ConfigPrivacy.hashSecret ?? ConfigDiscord.clientSecret)
    .update(`gmi:privacy:subject:v1:${provider}:${id.trim()}`)
    .digest('hex')
}

/** Active suppression survives completion until an explicit reconnection. */
export async function isErasureBlocked(discordID?: string | null, steamID64?: string | null): Promise<boolean> {
  if (!hasPrivacyHashSecret()) return false
  const subjects = [
    ...(discordID ? [{ discordSubject: privacySubject('discord', discordID) }] : []),
    ...(steamID64 ? [{ steamSubject: privacySubject('steam', steamID64) }] : []),
  ]
  if (subjects.length === 0) return false
  const request = await prisma.gm_user_erasure.findFirst({
    where: { reactivatedAt: null, OR: subjects },
    select: { id: true },
  })
  return request !== null
}

/** Status updates may contain dozens of players; check the batch with one database lookup. */
export async function getErasedSteamIDs(steamIDs: readonly string[]): Promise<Set<string>> {
  if (!hasPrivacyHashSecret()) return new Set()
  const subjects = new Map(steamIDs.filter(Boolean).map((id) => [privacySubject('steam', id), id]))
  if (subjects.size === 0) return new Set()
  const requests = await prisma.gm_user_erasure.findMany({
    where: { reactivatedAt: null, steamSubject: { in: [...subjects.keys()] } },
    select: { steamSubject: true },
  })
  return new Set(
    requests.flatMap((request) => {
      const id = request.steamSubject ? subjects.get(request.steamSubject) : undefined
      return id ? [id] : []
    }),
  )
}
