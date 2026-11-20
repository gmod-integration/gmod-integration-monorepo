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
    const navigation = screen.getByRole('navigation', { name: 'Guilds' })
    expect(within(navigation).getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/dashboard/guilds')
    for (const label of [
      'Informations',
      'Custom Bot',
      'Links',
      'Verification',
      'Bans',
      'Auto-Role',
      'Suggestions',
      'Tickets',
      'Servers',
    ]) {
      expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Informations' })).toHaveAttribute('aria-current', 'page')
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
      'Informations',
      'Configuration',
      'Status',
      'Roles',
      'Teams',
      'Chats',
      'Pseudo',
      'Rewards',
      'Players',
      'Warns',
      'Logs',
      'Errors',
      'Forwards',
      'Bugs Report',
      'Screenshots',
      'Vote',
      'Streams',
      'Tickets',
    ]) {
      expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute(
      'href',
      '/dashboard/guilds/g1/config/servers/s1/roles',
    )
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Teams' })).not.toHaveAttribute('aria-current', 'page')
  })

  it('updates the navigation category when moving from a community to a server', async () => {
    const history = historyAt('/dashboard/guilds/g1/config')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    history.set({ value: '/dashboard/guilds/g1/config/servers/s1/roles', replace: true })
    await vi.waitFor(() => expect(screen.getByRole('navigation', { name: 'Servers' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute('aria-current', 'page')
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
    expect(screen.getByRole('link', { name: 'Informations' })).toHaveAttribute('aria-label', 'Informations')
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
    expect(screen.getByRole('navigation', { name: 'Guildes' })).toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: 'Informations' })).toBeInTheDocument()
  })

  it('announces unavailable destinations and prevents navigation', () => {
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    const rewards = screen.getByRole('link', { name: 'Rewards' })
    expect(rewards).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(rewards)
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1')
  })
})
