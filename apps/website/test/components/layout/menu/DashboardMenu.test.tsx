import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import type * as SolidWeb from 'solid-js/web'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { DashboardMenu } from '../../../../src/components/layout/menu/DashboardMenu.js'
import { useI18n } from '../../../../src/i18n.js'

const isDevBox = vi.hoisted(() => ({ value: true }))
vi.mock('solid-js/web', async (importOriginal) => {
  const actual = await importOriginal<typeof SolidWeb>()
  return {
    ...actual,
    get isDev() {
      return isDevBox.value
    },
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  isDevBox.value = true
})
beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
  window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
})

function renderAt(path = '/dashboard/guilds/g1/config') {
  return renderWithProviders(() => <DashboardMenu />, { path: '*', history: historyAt(path) })
}

describe('Dashboard navigation', () => {
  it('provides named guild destinations and a back link to community selection', () => {
    renderAt()
    const navigation = screen.getByRole('navigation', { name: 'Discord communities' })
    expect(within(navigation).getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/dashboard/guilds')
    for (const label of [
      'Community settings',
      'Custom Bot',
      'Links',
      'Account verification',
      'Ban lists',
      'Automatic roles',
      'Suggestions',
      'Tickets',
      'Game servers',
    ]) {
      expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Community settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Suggestions' })).not.toHaveAttribute('aria-current', 'page')
  })

  it('provides server destinations with resolved community and server identifiers', () => {
    renderAt('/dashboard/guilds/g1/config/servers/s1/roles')
    const navigation = screen.getByRole('navigation', { name: 'Servers' })
    expect(within(navigation).getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/dashboard/guilds/g1/config/servers',
    )
    for (const label of [
      'Server and connection',
      'Configuration',
      'Status',
      'Map',
      'Statistics',
      'Role synchronization',
      'Team roles',
      'Chat relay',
      'Nickname synchronization',
      'Rewards',
      'Players',
      'Warns',
      'Logs',
      'Lua errors',
      'Forwards',
      'Player bug reports',
      'Screenshots',
      'Vote',
      'Streams',
      'Tickets',
    ]) {
      expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Role synchronization' })).toHaveAttribute(
      'href',
      '/dashboard/guilds/g1/config/servers/s1/roles',
    )
    expect(screen.getByRole('link', { name: 'Role synchronization' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Team roles' })).not.toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Statistics' })).toHaveAttribute(
      'href',
      '/dashboard/guilds/g1/config/servers/s1/statistics',
    )
    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute(
      'href',
      '/dashboard/guilds/g1/config/servers/s1/map',
    )
    expect(
      within(screen.getByRole('link', { name: 'Map' }).closest('.dashboard-nav-group') as HTMLElement).getByText(
        'Activity',
      ),
    ).toBeInTheDocument()
  })

  it('updates the navigation category when moving from a community to a server', async () => {
    const history = historyAt('/dashboard/guilds/g1/config')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/roles', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('navigation', { name: 'Servers' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Role synchronization' })).toHaveAttribute('aria-current', 'page')
  })

  it('lets developers follow preview destinations', async () => {
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    const rewards = screen.getByRole('link', { name: 'Rewards' })
    expect(rewards).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(rewards)
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1/rewards'))
  })

  it('persists collapse, keeps the back link accessible, and supports button activation', () => {
    renderAt()
    const collapse = screen.getByRole('button', { name: 'Collapse' })
    collapse.focus()
    expect(collapse).toHaveFocus()
    fireEvent.click(collapse, { detail: 0 })
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/dashboard/guilds')
    expect(screen.getByRole('link', { name: 'Community settings' })).toHaveAttribute('aria-label', 'Community settings')
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('dashboard-navigation-collapsed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('restores the saved collapse preference independently of the admin rail', () => {
    window.localStorage.setItem('dashboard-navigation-collapsed', 'true')
    window.localStorage.setItem('admin-navigation-collapsed', 'false')
    renderAt()
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens readable mobile navigation even with a collapsed desktop preference and closes after choosing a page', async () => {
    window.localStorage.setItem('dashboard-navigation-collapsed', 'true')
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1/status')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Role synchronization')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Role synchronization')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Role synchronization' }))
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1/roles'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('dashboard-navigation-collapsed')).toBe('true')
  })

  it('keeps the menu usable when its stored preference cannot be read', () => {
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === 'dashboard-navigation-collapsed') throw new Error('storage unavailable')
      return getItem.call(this, key)
    })
    expect(() => renderAt()).not.toThrow()
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('changes collapse state even when saving the preference fails', () => {
    renderAt()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))).not.toThrow()
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('updates section and item labels when the language changes', () => {
    const Page = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <button onClick={() => updateLocale('fr')}>Français</button>
          <DashboardMenu />
        </>
      )
    }
    renderWithProviders(Page, { path: '*', history: historyAt('/dashboard/guilds/g1/config') })
    fireEvent.click(screen.getByRole('button', { name: 'Français' }))
    expect(screen.getByRole('navigation', { name: 'Communautés Discord' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Liens' })).toHaveAttribute('href', '/dashboard/guilds/g1/config/links')
  })
})

describe('Production dashboard navigation', () => {
  beforeEach(() => {
    isDevBox.value = false
  })

  it('omits unfinished destinations', () => {
    renderAt()
    expect(screen.queryByRole('link', { name: 'Suggestions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tickets' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Community settings' })).toBeInTheDocument()
  })

  it('announces unavailable destinations and prevents navigation', () => {
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    const rewards = screen.getByRole('link', { name: 'Rewards' })
    expect(rewards).toHaveAttribute('aria-disabled', 'true')
    expect(within(rewards).getByText('Soon').closest('[data-tone]')).toHaveAttribute('data-tone', 'neutral')
    fireEvent.click(rewards)
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1')
  })
})
