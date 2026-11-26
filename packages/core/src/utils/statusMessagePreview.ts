import type { APIButtonComponentWithURL } from 'discord.js'
import redis from '@gmod/infra-redis'
import { AccessSnapshotSchema, type AccessSnapshot } from '@gmod/schema/server/AccessPolicySchema.js'
import type { Server } from '@gmod/domain-server/Server.js'
import prisma from '@gmod/infra-prisma'
import type { GmodPlayerInput } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import {
  StatusMessagePreviewSchema,
  type StatusMessagePreview,
  type StatusMessagePreviewInput,
} from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { buildServerStatusMessage, buildStatusConnectButton } from './statusMessage.js'
import { getServerChart } from './serverStatusChart.js'
import { effectiveServerSetting, limitResources } from '@gmod/domain-access/index.js'

/** Preview is a local illustration: it never starts Discord verification, publishes,
 * refreshes access caches or manufactures a paid grant when verification is cold. */
export async function resolvePreviewAccess(guildID: string): Promise<AccessSnapshot> {
  try {
    const raw = await redis.get(`guild:${guildID}:access:v1`)
    if (raw) {
      const cached = AccessSnapshotSchema.safeParse(JSON.parse(raw))
      if (
        cached.success &&
        cached.data.guildID === guildID &&
        cached.data.state === 'ready' &&
        Date.parse(cached.data.validUntil) > Date.now()
      )
        return cached.data
    }
  } catch {
    /* Local source failures remain unknown; no provider lookup is attempted. */
  }
  const [legacy, purchase] = await Promise.allSettled([
    prisma.gm_guild_premium.findFirst({ where: { guildID, revoked: false } }),
    prisma.gm_gmodstore_purchases.findFirst({ where: { guild: guildID, revoke: false } }),
  ])
  const sources: AccessSnapshot['sources'] = []
  if (legacy.status === 'fulfilled' && legacy.value && legacy.value.revoked !== true) sources.push('legacy')
  if (purchase.status === 'fulfilled' && purchase.value && purchase.value.revoke !== true) sources.push('gmodstore')
  return {
    guildID,
    premium: sources.length > 0,
    customBot: sources.includes('gmodstore'),
    state: sources.length ? 'ready' : 'unknown',
    sources,
    revision: 'local-preview',
    validUntil: new Date(Date.now() + 60_000).toISOString(),
  }
}

/** Deterministic examples exist only in the returned preview, never in player or status tables. */
async function simulationData(server: Server) {
  const stored = await prisma.gm_server_status.findUnique({
    where: { id: server.getID() },
    select: { hostname: true, map: true, gameMode: true, maxPlayers: true },
  })
  const playersList: GmodPlayerInput[] = ['Alex', 'Camille', 'Sam', 'Léa', 'Noa'].map((name, index) => {
    const account = 4_000_000_000n + BigInt(index)
    const connectTime = 4200 - index * 600
    return {
      name: `${name} [SIMULATION]`,
      steamID64: String(76561197960265728n + account),
      steamID: `STEAM_0:${account % 2n}:${account / 2n}`,
      userGroup: ['admin', 'vip', 'user', 'user', 'moderator'][index],
      kills: 3 + index * 2,
      deaths: 1 + index,
      connectTime,
      adjustedTime: connectTime - 30,
      timeLastTeamChange: 600 + index * 60,
      ping: 24 + index * 8,
      fps: 90 + index * 5,
      branch: 'x86-64',
      customValues: { level: String(5 + index), money: String(2500 + index * 500) },
      team: { id: index + 1, name: ['Citoyen', 'Médecin', 'Constructeur', 'Explorateur', 'Staff'][index] },
      position: { x: index * 64, y: index * 32, z: 64 },
      angle: { p: 0, y: index * 45, r: 0 },
      weapon: { class: 'weapon_physgun', printName: 'Physics Gun' },
    }
  })
  return {
    hostname: server.getName() || stored?.hostname || 'Garry’s Mod',
    map: stored?.map || 'gm_construct',
    gameMode: stored?.gameMode || 'sandbox',
    maxPlayers: Math.max(playersList.length, stored?.maxPlayers || 32),
    players: playersList.length,
    playersList,
    ip: '192.0.2.1',
    port: 27015,
  }
}

/** Render a temporary view of the server. Neither settings nor Discord messages are changed. */
export async function renderStatusPreview(
  server: Server,
  draft: StatusMessagePreviewInput,
  bot = { name: 'Gmod Integration', avatarUrl: null as string | null },
): Promise<StatusMessagePreview> {
  const access = await resolvePreviewAccess(server.getGuildID())
  const view = Object.create(server) as Server
  view.getSetting = async (setting: string) => {
    const key = setting as keyof typeof draft.settings
    return draft.settings[key] !== undefined ? draft.settings[key] : server.getSetting(setting)
  }
  view.getEffectiveSetting = async (setting: string) =>
    effectiveServerSetting(access, setting, await view.getSetting(setting))
  view.getEffectiveStatusButtons = async () =>
    draft.buttons === undefined
      ? limitResources(
          access,
          'status.buttons',
          await prisma.gm_status_button.findMany({
            where: { server: server.getID() },
            orderBy: { id: 'asc' },
          }),
        ).filter((button) => button.enable)
      : (limitResources(access, 'status.buttons', draft.buttons).filter(
          (button) => button.enable && button.name.trim() && button.emoji.trim() && button.url.trim(),
        ) as Awaited<ReturnType<Server['getServerStatusButtons']>>)

  const data = draft.simulation ? await simulationData(server) : await server.getStatusData()
  const message = await buildServerStatusMessage(
    view,
    structuredClone(data),
    draft.locale ?? 'en',
    { persistChart: false },
    { getServerChart, ButtonConnect: buildStatusConnectButton },
  )
  const imageUrl = message.files.length
    ? `data:image/png;base64,${message.files[0].attachment.toString('base64')}`
    : null
  return StatusMessagePreviewSchema.parse({
    bot,
    accessState: access.state,
    online: !!data?.hostname,
    ...(draft.simulation ? { simulation: true } : {}),
    embeds: message.embeds.map((builder) => {
      const embed = builder.toJSON()
      return {
        title: embed.title!,
        color: embed.color!,
        fields: embed.fields!.map((field) => ({ name: field.name, value: field.value, inline: field.inline === true })),
        timestamp: embed.timestamp!,
        imageUrl: embed.image ? imageUrl : null,
      }
    }),
    buttonRows: message.components.map((row) =>
      row.toJSON().components.map((rawButton) => {
        const button = rawButton as APIButtonComponentWithURL
        return {
          label: button.label!,
          // getStatusMessage only builds link buttons with normalized Unicode emojis.
          emoji: button.emoji!.name!,
          url: button.url!,
        }
      }),
    ),
  })
}
