import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../testUtils.js'
import { errJson, okJson } from './testHelpers.js'
import { DraftRegistryContext, type DraftEntry } from '../../../../../src/hooks/draftRegistry.js'

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
let failDashboard: boolean
let configuredRule: unknown
let recordedGrant: unknown
let integrations: unknown
let historyTotal: number
function setup() {
  ;(fetchAPI as Mock).mockImplementation(async (endpoint: string, method: string, body: unknown) => {
    if (method !== 'GET') return write(endpoint, method, body)
    if (endpoint === URL) return failDashboard ? errJson() : okJson({ rules: [configuredRule], integrations })
    if (endpoint.startsWith(URL + '/history'))
      return failHistory ? errJson() : okJson({ items: [recordedGrant], total: historyTotal, page: 1, pageSize: 25 })
    return okJson([])
  })
}
function renderPage() {
  const history = historyAt('/dashboard/guilds/g1/config/servers/s1/rewards')
  return {
    history,
    ...renderWithProviders(() => <Page />, {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/rewards',
      history,
    }),
  }
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
  failDashboard = false
  configuredRule = rule()
  recordedGrant = grant()
  integrations = null
  historyTotal = 1
  write = () => errJson()
  setup()
  guildRolesMutate([{ id: '123456789012345678', name: 'Community supporter', color: 111, colorHex: '#111111' }])
})

describe('ServerRewards', () => {
  it('blocks creation after a failed dashboard read and retries without confusing it with an empty list', async () => {
    failDashboard = true
    renderPage()
    const rules = within(screen.getByRole('region', { name: 'Rules' }))
    const retry = await rules.findByRole('button', { name: 'Try again' })
    expect(screen.getByRole('button', { name: 'Add reward' })).toBeDisabled()
    failDashboard = false
    await fireEvent.click(retry)
    await loaded()
    expect(screen.getByRole('button', { name: 'Add reward' })).toBeEnabled()
    expect(writes()).toHaveLength(0)
  })

  it('preserves an unavailable saved Discord role and discards the editor on cancellation or a server change', async () => {
    const roleID = '987654321098765432'
    configuredRule = { ...rule(), actions: [{ type: 'discord_role', roleID }] }
    const view = renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit reward' }))
    expect(input('reward-role-0')).toHaveValue(roleID)
    expect(modal().getByRole('option', { name: roleID })).toHaveValue(roleID)
    await fireEvent.input(input('rewards-name'), { target: { value: 'Unsubmitted change' } })
    await fireEvent(document.getElementById('rewards-editor')!, new Event('cancel', { bubbles: true }))
    expect(input('rewards-name')).toHaveValue('Welcome reward')
    await fireEvent.click(modal().getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Check player eligibility' }))
    view.history.set({ value: '/dashboard/guilds/g1/config/servers/s2/rewards' })
    await vi.waitFor(() => expect(document.getElementById('rewards-player')).not.toHaveAttribute('open'))
    expect(document.getElementById('rewards-editor')).not.toHaveAttribute('open')
    expect(writes()).toHaveLength(0)
  })

  it.each([
    ['already_received', 'This player has already received this reward.'],
    ['account_not_linked', 'The player must link their Steam and Discord accounts.'],
    ['entitlement_unavailable', 'Access could not be verified. Your saved configuration is preserved.'],
    ['insufficient_playtime', 'The required playtime has not been reached.'],
    ['rule_disabled', 'This rule is disabled.'],
    ['outside_period', 'This reward is outside its active period.'],
    ['cooldown', 'The delay before another reward has not elapsed.'],
    ['vote_required', 'A validated vote is required.'],
    ['missing_integration', 'A required addon is unavailable.'],
    ['identity_changed', 'The linked account changed before delivery.'],
    ['discord_unavailable', 'Discord is temporarily unavailable.'],
    ['role_not_manageable', 'The bot cannot assign this Discord role. Check the role and its permissions.'],
    ['journal_unavailable', 'The game server could not save the delivery record. No new reward was applied.'],
    ['execution_failed', 'The game integration reported a failed attribution.'],
    [
      'lua_execution_failed',
      'The Lua script stopped with an error. Check the game server before taking further action.',
    ],
    ['lua_unavailable', 'Lua execution is unavailable on the game server.'],
    ['expired', 'The delivery deadline has passed.'],
    ['execution_uncertain', 'The result could not be confirmed. Check the game server before taking further action.'],
    [
      'unknown_provider_reason',
      'The condition or delivery could not be confirmed. Check the player and server integration.',
    ],
  ])('explains the recorded delivery outcome %s without exposing reward source', async (reason, message) => {
    recordedGrant = {
      ...grant(),
      status: 'uncertain',
      actions: [{ ...grant().actions[0], status: 'uncertain', reason }],
    }
    renderPage()
    await loaded()
    const history = within(screen.getByRole('region', { name: 'History' }))
    await vi.waitFor(() => expect(history.getByText(message)).toBeInTheDocument())
    expect(within(history.getByText(STEAM).closest('tr')!).getAllByText('Needs review')).toHaveLength(2)
    expect(writes()).toHaveLength(0)
  })

  it('confirms deletion with its revision, keeps history and permits retry after a failed removal', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Delete reward' }))
    expect(modal('rewards-delete').getByText(/Previously delivered gifts and history are kept/)).toBeInTheDocument()
    await fireEvent.click(modal('rewards-delete').getByRole('button', { name: 'Cancel' }))
    expect(writes()).toHaveLength(0)
    await fireEvent.click(screen.getByRole('button', { name: 'Delete reward' }))
    await fireEvent.click(modal('rewards-delete').getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(modal('rewards-delete').getByRole('alert')).toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Rules' })).getByText('Welcome reward')).toBeInTheDocument()
    write = () => okJson({ deleted: true })
    await fireEvent.click(modal('rewards-delete').getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(document.getElementById('rewards-delete')).not.toHaveAttribute('open'))
    expect(writes().at(-1)).toEqual([URL + '/rules/' + RULE_ID, 'DELETE', { revision: 2 }])
    expect(within(screen.getByRole('region', { name: 'Rules' })).queryByText('Welcome reward')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'History' })).getByText(STEAM)).toBeInTheDocument()
  })

  it.each([
    [{ type: 'vote', cooldownSeconds: 21600 }, 'Validated vote'],
    [{ type: 'playtime', seconds: 18000 }, '5 hours played'],
    [{ type: 'manual' }, 'Manual attribution'],
  ])('edits saved trigger %j without losing its contents or scheduled period', async (trigger, label) => {
    configuredRule = {
      ...rule(),
      trigger,
      startsAt: NOW,
      endsAt: '2026-12-01T09:00:00.000Z',
      actions: [
        { type: 'pointshop_points', amount: 50 },
        { type: 'pointshop2_points', amount: 75 },
      ],
    }
    renderPage()
    await loaded()
    expect(within(screen.getByRole('region', { name: 'Rules' })).getByText(label as string)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit reward' }))
    expect(input('rewards-start').value).not.toBe('')
    await fireEvent.change(input('rewards-trigger'), { target: { value: 'vote' } })
    await fireEvent.input(input('rewards-cooldown'), { target: { value: '12' } })
    await fireEvent.change(input('rewards-trigger'), { target: { value: 'playtime' } })
    await fireEvent.input(input('rewards-hours'), { target: { value: '2.5' } })
    await fireEvent.input(input('rewards-description'), { target: { value: 'Updated milestone' } })
    await fireEvent.input(input('rewards-pending-days'), { target: { value: '14' } })
    await fireEvent.change(input('rewards-start'), { target: { value: '2026-11-26T10:00' } })
    await fireEvent.change(input('rewards-end'), { target: { value: '2026-12-02T10:00' } })
    await fireEvent.click(modal().getAllByRole('button', { name: 'Remove item' })[1]!)
    await fireEvent.click(input('rewards-enabled'))
    write = (_endpoint, _method, body) => okJson({ ...rule(), ...(body as { rule: object }).rule, revision: 3 })
    await fireEvent.click(modal().getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(document.getElementById('rewards-editor')).not.toHaveAttribute('open'))
    expect(writes().at(-1)![2]).toMatchObject({
      revision: 2,
      rule: {
        description: 'Updated milestone',
        enabled: false,
        trigger: { type: 'playtime', seconds: 9000 },
        pendingDays: 14,
        actions: [{ type: 'pointshop_points', amount: 50 }],
        startsAt: new Date('2026-11-26T10:00').toISOString(),
        endsAt: new Date('2026-12-02T10:00').toISOString(),
      },
    })
  })

  it('paginates history and resets pagination when its filters or page size change', async () => {
    historyTotal = 101
    renderPage()
    await loaded()
    const history = within(screen.getByRole('region', { name: 'History' }))
    const latest = () =>
      new URLSearchParams(
        (fetchAPI as Mock).mock.calls
          .filter(([ep, method]) => method === 'GET' && ep.startsWith(URL + '/history'))
          .at(-1)![0]
          .split('?')[1],
      )
    await fireEvent.click(history.getByRole('button', { name: 'Next page' }))
    await vi.waitFor(() => expect(latest().get('page')).toBe('2'))
    await fireEvent.click(await history.findByRole('button', { name: 'Previous page' }))
    await vi.waitFor(() => expect(latest().get('page')).toBe('1'))
    await fireEvent.click(await history.findByRole('button', { name: 'Next page' }))
    await fireEvent.click(await history.findByTitle('Back to the first page'))
    await vi.waitFor(() => expect(latest().get('page')).toBe('1'))
    await fireEvent.change(await history.findByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } })
    await vi.waitFor(() => expect(latest().get('pageSize')).toBe('50'))
    await fireEvent.change(input('rewards-history-rule'), { target: { value: RULE_ID } })
    await fireEvent.input(input('rewards-history-player'), { target: { value: STEAM } })
    await vi.waitFor(() =>
      expect(Object.fromEntries(latest())).toEqual({ page: '1', pageSize: '50', ruleID: RULE_ID, steamID64: STEAM }),
    )
    await fireEvent.input(input('rewards-history-player'), { target: { value: '765' } })
    await vi.waitFor(() => expect(latest().has('steamID64')).toBe(false))
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect((fetchAPI as Mock).mock.calls.filter(([ep]) => ep === URL).length).toBeGreaterThan(1))
  })

  it('distinguishes fresh integration availability from an outdated report', async () => {
    integrations = { darkrp: true, pointshop: false, pointshop2: true, updatedAt: new Date().toISOString() }
    renderPage()
    await loaded()
    const panel = within(screen.getByRole('region', { name: 'Integrations' }))
    expect(panel.getAllByText('Detected')).toHaveLength(2)
    expect(panel.getByText('Not detected')).toBeInTheDocument()
    integrations = { ...(integrations as object), updatedAt: '2000-01-01T00:00:00.000Z' }
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await vi.waitFor(() => expect(panel.getAllByText('Unknown')).toHaveLength(3))
  })

  it('shows failed eligibility checks, progress and missing addons without granting anything', async () => {
    renderPage()
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Check player eligibility' }))
    await fireEvent.input(input('rewards-player-steam'), { target: { value: STEAM } })
    await fireEvent.click(modal('rewards-player').getByRole('button', { name: 'Simulate without granting' }))
    await vi.waitFor(() => expect(modal('rewards-player').getByRole('alert')).toBeInTheDocument())
    write = () =>
      okJson({
        eligible: false,
        reason: 'playtime_required',
        linked: true,
        playedSeconds: 3600,
        requiredSeconds: 18000,
        alreadyReceived: false,
        missingIntegrations: ['darkrp'],
      })
    await fireEvent.click(modal('rewards-player').getByRole('button', { name: 'Simulate without granting' }))
    await vi.waitFor(() => expect(modal('rewards-player').getByText('Not eligible')).toBeInTheDocument())
    expect(modal('rewards-player').getByText('1 / 5 hours played')).toBeInTheDocument()
    expect(modal('rewards-player').getByText('Missing integrations: darkrp')).toBeInTheDocument()
    expect(writes().every(([ep]) => ep.endsWith('/simulate'))).toBe(true)
    await fireEvent(input('rewards-player-steam').closest('dialog')!, new Event('cancel', { bubbles: true }))
    expect(input('rewards-grant-reason')).toHaveValue('')
  })

  it('preserves and discards an attribution draft through the shared navigation guard', async () => {
    const entries: DraftEntry[] = []
    renderWithProviders(
      () => (
        <DraftRegistryContext.Provider
          value={{
            register: (entry) => {
              entries.push(entry)
              return () => {}
            },
          }}
        >
          <Page />
        </DraftRegistryContext.Provider>
      ),
      {
        path: '/dashboard/guilds/:guildID/config/servers/:serverID/rewards',
        history: historyAt('/dashboard/guilds/g1/config/servers/s1/rewards'),
      },
    )
    await loaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Check player eligibility' }))
    await fireEvent.input(input('rewards-grant-reason'), { target: { value: 'Unsubmitted reason' } })
    const attribution = entries.find((entry) => entry.dirty())!
    expect(attribution.pending()).toBe(false)
    attribution.discard()
    expect(input('rewards-grant-reason')).toHaveValue('')
    await fireEvent(document.getElementById('rewards-player')!, new Event('close', { bubbles: true }))
    expect(writes()).toHaveLength(0)
  })
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
