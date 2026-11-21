import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatusConfiguration } from '@gmod/schema/server/StatusConfigurationSchema.js'

const mocks = vi.hoisted(() => ({
  db: { $transaction: vi.fn(), gm_server_settings: { findMany: vi.fn() }, gm_status_button: { findMany: vi.fn() } },
  del: vi.fn(),
}))
vi.mock('@gmod/infra-prisma', () => ({ default: mocks.db }))
vi.mock('@gmod/infra-redis', () => ({ default: { del: mocks.del } }))
const { getStatusConfiguration, saveStatusConfiguration } = await import('../src/statusConfiguration.js')

type Button = NonNullable<StatusConfiguration['buttons'][number]> & { id: number; server: string }
let state: { settings: Record<string, string>; buttons: Button[]; published: boolean }
let nextID: number
let failSetting: string | undefined
let commitCount: number
let failButton: boolean
const refresh = vi.fn()
const server = { id: 's1', isPremium: vi.fn() }

beforeEach(() => {
  vi.resetAllMocks()
  state = {
    settings: { show_player_list_status: 'false', status_player_list_format: '{name}', show_status_chart: 'false' },
    buttons: [{ id: 1, server: 's1', name: 'Rules', emoji: '📘', url: 'https://example.test/rules', enable: true }],
    published: true,
  }
  nextID = 2
  failSetting = undefined
  commitCount = 0
  failButton = false
  const readSettings = () => Object.entries(state.settings).map(([setting, value]) => ({ setting, value }))
  mocks.db.gm_server_settings.findMany.mockImplementation(async () => readSettings())
  mocks.db.gm_status_button.findMany.mockImplementation(async () => state.buttons)
  mocks.db.$transaction.mockImplementation(async (operation) => {
    const working = structuredClone(state)
    const tx = {
      gm_server: { update: vi.fn().mockResolvedValue({}) },
      gm_server_settings: {
        findMany: async () => Object.entries(working.settings).map(([setting, value]) => ({ setting, value })),
        upsert: async ({ create }: { create: { setting: string; value: string } }) => {
          if (failSetting === create.setting) throw new Error('SQL interrupted')
          working.settings[create.setting] = create.value
        },
      },
      gm_status_button: {
        findMany: async () => working.buttons,
        deleteMany: async ({ where }: { where: { id: { notIn: number[] } } }) => {
          working.buttons = working.buttons.filter((button) => where.id.notIn.includes(button.id))
        },
        create: async ({ data }: { data: Omit<Button, 'id'> }) => {
          if (failButton) throw new Error('Button SQL interrupted')
          working.buttons.push({ ...data, id: nextID++ })
        },
        update: async ({ where, data }: { where: { id: number }; data: Omit<Button, 'id'> }) => {
          working.buttons = working.buttons.map((button) => (button.id === where.id ? { ...button, ...data } : button))
        },
      },
      gm_status: { findFirst: async () => (working.published ? { server: 's1' } : null) },
    }
    const accepted = await operation(tx)
    state = working
    commitCount++
    return accepted
  })
  server.isPremium.mockResolvedValue(true)
  mocks.del.mockResolvedValue(1)
  refresh.mockResolvedValue(true)
})

async function edited() {
  const current = await getStatusConfiguration('s1')
  return {
    revision: current.revision,
    configuration: {
      ...current.configuration,
      settings: { ...current.configuration.settings, show_player_list_status: true },
      buttons: [{ name: 'Shop', emoji: '🛒', url: 'https://example.test/shop', enable: true }],
    },
  }
}

describe('aggregate status configuration', () => {
  it('reads stored values, provides a stable revision and serializes only configuration fields', async () => {
    const first = await getStatusConfiguration('s1')
    expect(await getStatusConfiguration('s1')).toEqual(first)
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(first.configuration.buttons[0]).not.toHaveProperty('server')
  })
  it('commits every setting and button in one transaction, then invalidates caches and confirms delivery', async () => {
    const input = await edited()
    refresh.mockImplementation(async () => {
      expect(commitCount).toBe(1)
      expect(state.settings.show_player_list_status).toBe('true')
      return true
    })
    const accepted = await saveStatusConfiguration(server, input, refresh)
    expect(accepted.sync).toBe('applied')
    expect(accepted.configuration.buttons).toEqual([
      { id: 2, name: 'Shop', emoji: '🛒', url: 'https://example.test/shop', enable: true },
    ])
    expect(accepted.revision).not.toBe(input.revision)
    expect(mocks.db.$transaction).toHaveBeenCalledOnce()
    expect(mocks.del).toHaveBeenCalledWith(
      'server:s1:setting:show_player_list_status',
      'server:s1:setting:status_player_list_format',
      'server:s1:setting:show_status_chart',
    )
  })
  it('leaves every stored value and button unchanged if a setting write fails', async () => {
    const input = await edited()
    const previous = structuredClone(state)
    failSetting = 'status_player_list_format'
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toThrow('SQL interrupted')
    expect(state).toEqual(previous)
    expect(commitCount).toBe(0)
    expect(refresh).not.toHaveBeenCalled()
  })
  it('rolls back settings and button deletions when creating the replacement button fails', async () => {
    const input = await edited()
    const previous = structuredClone(state)
    failButton = true
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toThrow('Button SQL interrupted')
    expect(state).toEqual(previous)
    expect(commitCount).toBe(0)
    expect(refresh).not.toHaveBeenCalled()
  })
  it('refuses an exact replay after a successful creation instead of creating the button twice', async () => {
    const input = await edited()
    await saveStatusConfiguration(server, input, refresh)
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toMatchObject({ code: 'conflict' })
    expect(state.buttons).toHaveLength(1)
    expect(state.buttons[0]?.id).toBe(2)
    expect(commitCount).toBe(1)
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('rejects an outdated revision without overwriting another editor', async () => {
    const input = await edited()
    state.settings.status_player_list_format = '{team}'
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toMatchObject({ code: 'conflict' })
    expect(state.settings.status_player_list_format).toBe('{team}')
    expect(commitCount).toBe(0)
  })
  it('rejects button IDs from another server before committing any change', async () => {
    const input = await edited()
    input.configuration.buttons[0] = { ...input.configuration.buttons[0], id: 999 } as never
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toMatchObject({ code: 'invalid_button' })
    expect(commitCount).toBe(0)
    expect(state.buttons[0]?.id).toBe(1)
  })
  it('enforces premium chart and button limits on the backend', async () => {
    server.isPremium.mockResolvedValue(false)
    const input = await edited()
    input.configuration.settings.show_status_chart = true
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toMatchObject({ code: 'premium_required' })
    input.configuration.settings.show_status_chart = false
    input.configuration.buttons = Array.from({ length: 4 }, () => input.configuration.buttons[0]!)
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toMatchObject({ code: 'premium_required' })
    expect(commitCount).toBe(0)
  })
  it('permits disabling a previously saved premium chart after premium expires', async () => {
    state.settings.show_status_chart = 'true'
    server.isPremium.mockResolvedValue(false)
    const input = await edited()
    input.configuration.settings.show_status_chart = false
    expect((await saveStatusConfiguration(server, input, refresh)).configuration.settings.show_status_chart).toBe(false)
  })
  it.each(['throw', 'false', 'cache'] as const)(
    'reports committed data with pending delivery after %s failure',
    async (failure) => {
      if (failure === 'throw') refresh.mockRejectedValue(new Error('Discord unavailable'))
      if (failure === 'false') refresh.mockResolvedValue(false)
      if (failure === 'cache') mocks.del.mockRejectedValue(new Error('Redis unavailable'))
      const result = await saveStatusConfiguration(server, await edited(), refresh)
      expect(result.sync).toBe('pending')
      expect(state.settings.show_player_list_status).toBe('true')
      expect(commitCount).toBe(1)
    },
  )
  it('does not publish a message as a side effect of saving an unpublished configuration', async () => {
    state.published = false
    expect((await saveStatusConfiguration(server, await edited(), refresh)).sync).toBe('not_published')
    expect(refresh).not.toHaveBeenCalled()
  })
  it('rejects invalid names, URLs and duplicate IDs without starting a transaction', async () => {
    const input = await edited()
    input.configuration.buttons[0]!.url = 'javascript:alert(1)'
    await expect(saveStatusConfiguration(server, input, refresh)).rejects.toMatchObject({
      code: 'invalid_configuration',
    })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})
