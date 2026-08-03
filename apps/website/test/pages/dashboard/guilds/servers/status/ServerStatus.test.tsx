import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: ServerStatus } = await import('../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatus.js')

afterEach(() => cleanup())

describe('pages/dashboard/guilds/servers/status/ServerStatus.tsx', () => {
  it('renders the status message and status buttons panels together', async () => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    guildChannelsMutate([])
    renderWithProviders(() => <ServerStatus />, {
      path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
      history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
    })
    await vi.waitFor(() => expect(screen.getByText('Server Status')).toBeInTheDocument())
    expect(screen.getByText('Status Buttons')).toBeInTheDocument()
  })
})
