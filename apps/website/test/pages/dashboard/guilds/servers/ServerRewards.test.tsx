import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { errJson, okJson } from './testHelpers.js'

vi.mock('../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(async () => okJson([])),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((value: string) => value),
}))
const { fetchAPI } = await import('../../../../../src/utils/api.js')
const { guildRolesMutate } = await import('../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const Page = (await import('../../../../../src/pages/dashboard/guilds/servers/ServerRewards.js')).default
const URL = '/v6/guilds/g1/servers/s1/rewards'
const RULE_ID = '11111111-1111-4111-8111-111111111111'
const STEAM = '76561198000000001'
const NOW = '2026-11-24T09:00:00.000Z'
const rule = () => ({
  id: RULE_ID,
  revision: 2,
  name: 'Welcome reward',
  description: 'For linked players',
  enabled: true,
  trigger: { type: 'verification' },
  actions: [{ type: 'darkrp_money', amount: 5000 }],
  pendingDays: 7,
  startsAt: null,
  endsAt: null,
  createdAt: NOW,
  updatedAt: NOW,
})
const grant = () => ({
  id: '22222222-2222-4222-8222-222222222222',
  ruleID: RULE_ID,
  ruleName: 'Welcome reward',
  steamID64: STEAM,
  discordID: '123456789012345678',
  actorDiscordID: '123456789012345679',
  status: 'pending',
  createdAt: NOW,
  updatedAt: NOW,
  expiresAt: '2026-12-01T09:00:00.000Z',
  reason: 'Community event',
  actions: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      type: 'darkrp_money',
      amount: 5000,
      status: 'pending',
      reason: 'player_offline',
    },
  ],
})
let write: (endpoint: string, method: string, body: unknown) => unknown
let failHistory: boolean
let configuredRule: unknown
let recordedGrant: unknown
function setup() {
  ;(fetchAPI as Mock).mockImplementation(async (endpoint: string, method: string, body: unknown) => {
    if (method !== 'GET') return write(endpoint, method, body)
    if (endpoint === URL) return okJson({ rules: [configuredRule], integrations: null })
    if (endpoint.startsWith(URL + '/history'))
      return failHistory ? errJson() : okJson({ items: [recordedGrant], total: 1, page: 1, pageSize: 25 })
    return okJson([])
  })
}
function renderPage() {
  return renderWithProviders(() => <Page />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/rewards',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/rewards'),
  })
}
const modal = (id = 'rewards-editor') => within(document.getElementById(id)!)
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const writes = () => (fetchAPI as Mock).mock.calls.filter(([, method]) => method !== 'GET')
async function loaded() {
  await vi.waitFor(() =>
    expect(within(screen.getByRole('region', { name: 'Rules' })).getByText('Welcome reward')).toBeInTheDocument(),
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
  vi.clearAllMocks()
  failHistory = false
  configuredRule = rule()
  recordedGrant = grant()
  write = () => errJson()
  setup()
  guildRolesMutate([{ id: '123456789012345678', name: 'Community supporter', color: 111, colorHex: '#111111' }])
})

describe('ServerRewards', () => {
  it('creates a Lua and money bundle with the exact multiline source and no Lua amount field', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add reward' }))
    await fireEvent.input(input('rewards-name'), { target: { value: 'Custom gift' } })
    await fireEvent.change(input('reward-action-0'), { target: { value: 'lua' } })
    expect(document.getElementById('reward-amount-0')).not.toBeInTheDocument()
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
    const code = 'local recipient = ply\n\trecipient:ChatPrint(steamID64 .. reward.name)'
    await fireEvent.input(input('reward-code-0'), { target: { value: code } })
    expect(modal().getByText(/Available variables: ply, steamID64 and reward/)).toBeInTheDocument()
    await fireEvent.click(modal().getByRole('button', { name: 'Add item' }))
    write = (_endpoint, _method, body) => okJson({ ...rule(), ...(body as object), revision: 1 })
    await fireEvent.click(modal().getByRole('button', { name: 'Create' }))
    await vi.waitFor(() => expect(document.getElementById('rewards-editor')).not.toHaveAttribute('open'))
    expect(writes()).toHaveLength(1)
    expect(writes()[0][2]).toMatchObject({
      name: 'Custom gift',
      actions: [
        { type: 'lua', code },
        { type: 'darkrp_money', amount: 5000 },
      ],
    })
    expect(within(screen.getByRole('region', { name: 'Rules' })).getByText('Execute Lua')).toBeInTheDocument()
  })

  it.each(['', ' \n\t ', '\0', 'x'.repeat(16_385)])(
    'requires a nonblank Lua script within the source limit and without NUL: case %#',
    async (code) => {
      renderPage()
      await loaded()
      await fireEvent.click(screen.getByRole('button', { name: 'Add reward' }))
      await fireEvent.input(input('rewards-name'), { target: { value: 'Custom gift' } })
      await fireEvent.change(input('reward-action-0'), { target: { value: 'lua' } })
      await fireEvent.input(input('reward-code-0'), { target: { value: code } })
      expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
      expect(writes()).toHaveLength(0)
      await fireEvent.input(input('reward-code-0'), { target: { value: 'ply:ChatPrint("Gift")' } })
      expect(modal().getByRole('button', { name: 'Create' })).toBeEnabled()
    },
  )

  it('loads and preserves a saved Lua script after a failed edit and sends its revision on retry', async () => {
    const original = 'ply:ChatPrint("Original")\n'
    const changed = 'ply:ChatPrint("Changed")\nreturn true'
    configuredRule = { ...rule(), actions: [{ type: 'lua', code: original }] }
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit reward' }))
    expect(input('reward-code-0')).toHaveValue(original)
    const codeField = input('reward-code-0')
    await fireEvent.input(codeField, { target: { value: changed } })
    expect(input('reward-code-0')).toBe(codeField)
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal().getByRole('alert')).toBeInTheDocument())
    expect(input('reward-code-0')).toHaveValue(changed)
    write = () => okJson({ ...rule(), revision: 3, actions: [{ type: 'lua', code: changed }] })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(document.getElementById('rewards-editor')).not.toHaveAttribute('open'))
    expect(writes().at(-1)![2]).toMatchObject({ revision: 2, rule: { actions: [{ type: 'lua', code: changed }] } })
  })

  it('shows Lua history and its failure reason without requiring or displaying script source', async () => {
    recordedGrant = {
      ...grant(),
      status: 'failed',
      actions: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          type: 'lua',
          status: 'failed',
          reason: 'lua_compile_failed',
        },
      ],
    }
    renderPage()
    await loaded()
    const history = within(screen.getByRole('region', { name: 'History' }))
    await vi.waitFor(() => expect(history.getByText(STEAM)).toBeInTheDocument())
    expect(history.getByText('Execute Lua')).toBeInTheDocument()
    expect(
      history.getByText('The Lua script could not compile. Check its syntax in the reward editor.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Server Lua code' })).not.toBeInTheDocument()
  })

  it('loads saved rules and discards a template without creating a placeholder', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('For linked players')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'First 5 hours' }))
    expect(input('rewards-name')).toHaveValue('First 5 hours')
    expect(input('rewards-hours')).toHaveValue(5)
    expect(modal().getByRole('button', { name: 'Create' })).toBeEnabled()
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Add reward' }))
    expect(input('rewards-name')).toHaveValue('')
    expect(modal().getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('validates amounts, preserves failed edits and sends the saved revision on retry', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit reward' }))
    await fireEvent.input(input('reward-amount-0'), { target: { value: '1000001' } })
    expect(modal().getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.input(input('reward-amount-0'), { target: { value: '2500' } })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal().getByRole('alert')).toBeInTheDocument())
    expect(input('reward-amount-0')).toHaveValue(2500)
    expect(document.getElementById('rewards-editor')).toHaveAttribute('open')
    write = () => okJson({ ...rule(), revision: 3, actions: [{ type: 'darkrp_money', amount: 2500 }] })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(document.getElementById('rewards-editor')).not.toHaveAttribute('open'))
    const last = writes().at(-1)!
    expect(last[0]).toBe(URL + '/rules/' + RULE_ID)
    expect(last[1]).toBe('PUT')
    expect(last[2]).toMatchObject({ revision: 2, rule: { actions: [{ type: 'darkrp_money', amount: 2500 }] } })
  })

  it('creates a complete bundle once and keeps its fields stable while typing', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Add reward' }))
    await fireEvent.input(input('rewards-name'), { target: { value: 'Voting gift' } })
    const amount = input('reward-amount-0')
    await fireEvent.input(amount, { target: { value: '120' } })
    expect(input('reward-amount-0')).toBe(amount)
    await fireEvent.click(modal().getByRole('button', { name: 'Add item' }))
    await fireEvent.change(input('reward-action-1'), { target: { value: 'discord_role' } })
    await fireEvent.change(input('reward-role-1'), { target: { value: '123456789012345678' } })
    let resolve!: (response: unknown) => void
    write = () =>
      new Promise((finish) => {
        resolve = finish
      })
    const button = modal().getByRole('button', { name: 'Create' })
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(input('rewards-name')).toBeDisabled()
    await fireEvent.click(button)
    expect(writes()).toHaveLength(1)
    expect(writes()[0][2]).toMatchObject({
      name: 'Voting gift',
      actions: [
        { type: 'darkrp_money', amount: 120 },
        { type: 'discord_role', roleID: '123456789012345678' },
      ],
    })
    resolve(
      okJson({ ...rule(), ...(writes()[0][2] as object), id: '44444444-4444-4444-8444-444444444444', revision: 1 }),
    )
    await vi.waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Rules' })).getByText('Voting gift')).toBeInTheDocument(),
    )
  })

  it('simulates without granting and requires a separate confirmed, idempotent manual attribution', async () => {
    configuredRule = { ...rule(), actions: [...rule().actions, { type: 'lua', code: 'ply:ChatPrint("Gift")' }] }
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Check player eligibility' }))
    await fireEvent.input(input('rewards-player-steam'), { target: { value: STEAM } })
    write = () =>
      okJson({
        eligible: true,
        reason: null,
        linked: true,
        playedSeconds: 3600,
        requiredSeconds: null,
        alreadyReceived: false,
        missingIntegrations: [],
      })
    await fireEvent.click(modal('rewards-player').getByRole('button', { name: 'Simulate without granting' }))
    await vi.waitFor(() => expect(modal('rewards-player').getByText('Eligible')).toBeInTheDocument())
    expect(writes()).toHaveLength(1)
    expect(writes()[0][0]).toBe(URL + '/rules/' + RULE_ID + '/simulate')
    await fireEvent.input(input('rewards-grant-reason'), { target: { value: 'Community event' } })
    await fireEvent.click(modal('rewards-player').getByRole('button', { name: 'Grant reward' }))
    expect(writes()).toHaveLength(1)
    write = () => ({ ...errJson(), status: 409 })
    await fireEvent.click(modal('rewards-grant').getByRole('button', { name: 'Grant reward' }))
    await vi.waitFor(() => expect(modal('rewards-grant').getByRole('alert')).toBeInTheDocument())
    const firstRequest = writes().at(-1)![2]
    expect(firstRequest).toMatchObject({ revision: 2 })
    expect(modal('rewards-grant').getByRole('note')).toHaveTextContent('This reward changed.')
    expect(input('rewards-grant-reason')).toHaveValue('Community event')
    expect(modal('rewards-grant').getByText('5,000 DarkRP money')).toBeInTheDocument()
    expect(modal('rewards-grant').getByText('Execute Lua')).toBeInTheDocument()
    write = () => okJson(grant())
    await fireEvent.click(modal('rewards-grant').getByRole('button', { name: 'Grant reward' }))
    await vi.waitFor(() => expect(modal('rewards-player').getByText(/Attribution recorded/)).toBeInTheDocument())
    expect(writes().at(-1)![2]).toEqual(firstRequest)
    expect(writes().at(-1)![0]).toBe(URL + '/rules/' + RULE_ID + '/grant')
  })

  it('keeps history failures separate from an empty list and applies status filters', async () => {
    failHistory = true
    renderPage()
    await loaded()
    const history = within(screen.getByRole('region', { name: 'History' }))
    await vi.waitFor(() => expect(history.getByRole('button', { name: 'Try again' })).toBeInTheDocument())
    failHistory = false
    await fireEvent.click(history.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(history.getByText(STEAM)).toBeInTheDocument())
    expect(history.getByText('Waiting for the player to connect to the game server.')).toBeInTheDocument()
    await fireEvent.change(input('rewards-history-status'), { target: { value: 'uncertain' } })
    await vi.waitFor(() =>
      expect(
        (fetchAPI as Mock).mock.calls.some(
          ([endpoint]) => endpoint === URL + '/history?page=1&pageSize=25&status=uncertain',
        ),
      ).toBe(true),
    )
  })

  it('shows unknown integrations until the addon reports its capabilities', async () => {
    renderPage()
    await loaded()
    const integrations = within(screen.getByRole('region', { name: 'Integrations' }))
    expect(integrations.getByText(/No integration report yet/)).toBeInTheDocument()
    expect(integrations.getAllByText('Unknown')).toHaveLength(3)
    expect(integrations.queryByText('Not detected')).not.toBeInTheDocument()
  })

  it('allows suspended rules to be disabled or removed while creation stays unavailable', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: 'Add reward' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete reward' })).toBeEnabled()
    write = () => okJson({ ...rule(), enabled: false, revision: 3 })
    await fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0][2]).toMatchObject({ revision: 2, rule: { enabled: false } })
  })
})
