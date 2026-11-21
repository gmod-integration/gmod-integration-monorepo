import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../../../testUtils.js'

vi.mock('../../../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
  getAPIUrl: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

const { guildChannelsMutate } = await import('../../../../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: ServerStatus } =
  await import('../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatus.js')

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
  guildChannelsMutate([])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function viewport(initialWide: boolean) {
  let wide = initialWide
  const query = Object.assign(new EventTarget(), {
    get matches() {
      return wide
    },
    media: '(min-width: 1280px)',
  })
  // Object.assign copies values; retain a reactive getter for simulated viewport changes.
  Object.defineProperty(query, 'matches', { get: () => wide })
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList)
  return (nextWide: boolean) => {
    wide = nextWide
    query.dispatchEvent(new Event('change'))
  }
}

function renderStatus() {
  return renderWithProviders(() => <ServerStatus />, {
    path: '/dashboard/guilds/:guildID/config/servers/:serverID/status',
    history: historyAt('/dashboard/guilds/g1/config/servers/s1/status'),
  })
}

const panelFor = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls')!)!

describe('pages/dashboard/guilds/servers/status/ServerStatus.tsx', () => {
  it('keeps configuration and the preview visible together on desktop', async () => {
    viewport(true)
    const { container } = renderStatus()
    await vi.waitFor(() => expect(screen.getByText('Server Status')).toBeInTheDocument())
    expect(screen.getByText('Status Buttons')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Simulation' })).toBeInTheDocument()
    expect(container.querySelector('[data-status-configuration]')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.status-preview-panel')).not.toHaveAttribute('hidden')
  })

  it('switches mobile panels without remounting the preview or losing an edited setting', async () => {
    viewport(false)
    const { container } = renderStatus()
    const configuration = screen.getByRole('tab', { name: 'Configuration' })
    const preview = screen.getByRole('tab', { name: 'Live Discord preview' })
    expect(configuration).toHaveAttribute('aria-selected', 'true')
    expect(panelFor(preview)).toHaveAttribute('hidden')
    const checkbox = screen.getByRole('checkbox', { name: /Show Player List/ })
    await vi.waitFor(() => expect(checkbox).toBeEnabled())
    await fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    const renderedPreview = container.querySelector('[data-status-simulation] .discord-preview-card')
    const previewCount = container.querySelectorAll('.discord-preview-card').length

    await fireEvent.click(preview)
    expect(preview).toHaveAttribute('aria-selected', 'true')
    expect(panelFor(configuration)).toHaveAttribute('hidden')
    expect(panelFor(preview)).not.toHaveAttribute('hidden')
    expect(screen.getByRole('tabpanel', { name: 'Live Discord preview' })).toBeInTheDocument()
    expect(container.querySelectorAll('.discord-preview-card')).toHaveLength(previewCount)
    expect(container.querySelector('[data-status-simulation] .discord-preview-card')).toBe(renderedPreview)

    await fireEvent.keyDown(preview, { key: 'Home' })
    expect(configuration).toHaveFocus()
    expect(configuration).toHaveAttribute('aria-selected', 'true')
    expect(checkbox).toBeChecked()
    await fireEvent.keyDown(configuration, { key: 'ArrowRight' })
    expect(preview).toHaveFocus()
    expect(preview).toHaveAttribute('aria-selected', 'true')
  })

  it('restores both panels when widening the viewport and retains the selected mobile tab', async () => {
    const resize = viewport(false)
    renderStatus()
    const configuration = screen.getByRole('tab', { name: 'Configuration' })
    const preview = screen.getByRole('tab', { name: 'Live Discord preview' })
    await fireEvent.click(preview)
    expect(panelFor(configuration)).toHaveAttribute('hidden')
    resize(true)
    expect(panelFor(configuration)).not.toHaveAttribute('hidden')
    expect(panelFor(preview)).not.toHaveAttribute('hidden')
    expect(panelFor(preview)).not.toHaveAttribute('role', 'tabpanel')
    resize(false)
    expect(panelFor(configuration)).toHaveAttribute('hidden')
    expect(preview).toHaveAttribute('aria-selected', 'true')
  })
})
