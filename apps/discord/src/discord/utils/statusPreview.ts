import type { APIButtonComponentWithURL, Guild } from 'discord.js'
import type { Server } from '@gmod/domain-server/Server.js'
import prisma from '@gmod/infra-prisma'
import type { GmodPlayerInput } from '@gmod/schema/gmod/GmodPlayerSchema.js'
import {
  StatusMessagePreviewSchema,
  type StatusMessagePreview,
  type StatusMessagePreviewInput,
} from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { getStatusMessage } from './messages.js'

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
  guild: Guild,
): Promise<StatusMessagePreview> {
  const view = Object.create(server) as Server
  view.getSetting = async (setting: string) => {
    const key = setting as keyof typeof draft.settings
    return draft.settings[key] !== undefined ? draft.settings[key] : server.getSetting(setting)
  }
  view.getServerStatusButtons = async () =>
    draft.buttons === undefined
      ? server.getServerStatusButtons()
      : (draft.buttons.filter(
          (button) => button.enable && button.name.trim() && button.emoji.trim() && button.url.trim(),
        ) as Awaited<ReturnType<Server['getServerStatusButtons']>>)

  const data = draft.simulation ? await simulationData(server) : await server.getStatusData()
  const message = await getStatusMessage(view, structuredClone(data), draft.locale ?? guild.preferredLocale, {
    persistChart: false,
  })
  const imageUrl = message.files.length
    ? `data:image/png;base64,${message.files[0].attachment.toString('base64')}`
    : null
  const botMember = guild.members.me
  return StatusMessagePreviewSchema.parse({
    bot: {
      name: botMember?.displayName || guild.client.user.username,
      avatarUrl: botMember ? botMember.displayAvatarURL() : guild.client.user.displayAvatarURL(),
    },
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
