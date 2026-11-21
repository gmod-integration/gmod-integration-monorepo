import { createHash } from 'node:crypto'
import prisma from '@gmod/infra-prisma'
import type { Prisma } from '@gmod/infra-prisma/client.js'
import redis from '@gmod/infra-redis'
import {
  resolveGuildAccess,
  assertQuota,
  assertServerSettingChange,
  capabilityLimit,
} from '@gmod/domain-access/index.js'
import {
  StatusConfigurationSaveSchema,
  type StatusConfiguration,
  type StatusConfigurationSnapshot,
} from '@gmod/schema/server/StatusConfigurationSchema.js'

const keys = ['show_player_list_status', 'status_player_list_format', 'show_status_chart'] as const
const defaults: StatusConfiguration['settings'] = {
  show_player_list_status: false,
  status_player_list_format: '{connectTime} - {name}',
  show_status_chart: false,
}
type Store = Pick<Prisma.TransactionClient, 'gm_server_settings' | 'gm_status_button'>
type StatusServer = { id: string; guild: string }

export class StatusConfigurationError extends Error {
  constructor(public readonly code: 'conflict' | 'premium_required' | 'invalid_button' | 'invalid_configuration') {
    super(code)
  }
}

async function readConfiguration(serverID: string, store: Store): Promise<StatusConfigurationSnapshot> {
  const [settings, buttons] = await Promise.all([
    store.gm_server_settings.findMany({ where: { serverID, setting: { in: [...keys] } } }),
    store.gm_status_button.findMany({ where: { server: serverID }, orderBy: { id: 'asc' } }),
  ])
  const saved = Object.fromEntries(settings.map(({ setting, value }) => [setting, value]))
  const boolean = (key: (typeof keys)[number], fallback: boolean) =>
    saved[key] === undefined ? fallback : ['true', '1'].includes(saved[key])
  const configuration: StatusConfiguration = {
    settings: {
      show_player_list_status: boolean('show_player_list_status', defaults.show_player_list_status),
      status_player_list_format: saved.status_player_list_format ?? defaults.status_player_list_format,
      show_status_chart: boolean('show_status_chart', defaults.show_status_chart),
    },
    buttons: buttons.map(({ id, name, emoji, url, enable }) => ({ id, name, emoji, url, enable })),
  }
  const revision = createHash('sha256').update(JSON.stringify(configuration)).digest('hex')
  return { configuration, revision }
}

export function getStatusConfiguration(serverID: string) {
  return readConfiguration(serverID, prisma)
}

/** All related SQL rows commit together; external delivery has a distinct result. */
export async function saveStatusConfiguration(
  server: StatusServer,
  input: StatusConfigurationSnapshot,
  refreshDiscord: () => Promise<unknown>,
) {
  const parsed = StatusConfigurationSaveSchema.safeParse(input)
  if (!parsed.success) throw new StatusConfigurationError('invalid_configuration')
  input = parsed.data
  const access = await resolveGuildAccess(server.guild)
  const committed = await prisma.$transaction(async (tx) => {
    // A row lock serializes aggregate edits, making the revision check reliable between instances.
    await tx.gm_server.update({ where: { id: server.id }, data: { updatedAt: new Date() } })
    const current = await readConfiguration(server.id, tx)
    if (current.revision !== input.revision) throw new StatusConfigurationError('conflict')
    assertServerSettingChange(
      access,
      'show_status_chart',
      input.configuration.settings.show_status_chart,
      current.configuration.settings.show_status_chart,
    )
    const buttonLimit = capabilityLimit(access, 'status.buttons')
    if (
      buttonLimit !== null &&
      input.configuration.buttons.length > buttonLimit &&
      (input.configuration.buttons.length > current.configuration.buttons.length ||
        input.configuration.buttons.some((button) => button.id === undefined))
    )
      assertQuota(access, 'status.buttons', input.configuration.buttons.length - 1)
    const owned = new Set(current.configuration.buttons.map((button) => button.id))
    if (input.configuration.buttons.some((button) => button.id !== undefined && !owned.has(button.id)))
      throw new StatusConfigurationError('invalid_button')
    for (const setting of keys) {
      const value = String(input.configuration.settings[setting])
      await tx.gm_server_settings.upsert({
        where: { serverID_setting: { serverID: server.id, setting } },
        create: { serverID: server.id, setting, value },
        update: { value },
      })
    }
    const retained = input.configuration.buttons.flatMap((button) => (button.id === undefined ? [] : [button.id]))
    await tx.gm_status_button.deleteMany({ where: { server: server.id, id: { notIn: retained } } })
    for (const { id, ...button } of input.configuration.buttons) {
      if (id === undefined) await tx.gm_status_button.create({ data: { server: server.id, ...button } })
      else await tx.gm_status_button.update({ where: { id, server: server.id }, data: button })
    }
    const snapshot = await readConfiguration(server.id, tx)
    const published = await tx.gm_status.findFirst({ where: { server: server.id }, select: { server: true } })
    return { ...snapshot, published: !!published }
  })
  try {
    await redis.del(...keys.map((setting) => `server:${server.id}:setting:${setting}`))
    if (!committed.published)
      return { configuration: committed.configuration, revision: committed.revision, sync: 'not_published' as const }
    if ((await refreshDiscord()) === false)
      return { configuration: committed.configuration, revision: committed.revision, sync: 'pending' as const }
    return { configuration: committed.configuration, revision: committed.revision, sync: 'applied' as const }
  } catch {
    // The configuration is already committed. Never tell the client that its draft was rejected.
    return { configuration: committed.configuration, revision: committed.revision, sync: 'pending' as const }
  }
}
