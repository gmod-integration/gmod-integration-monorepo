import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { DashboardMenu } from '../../../../src/components/layout/menu/DashboardMenu.js'

// `isDev` (from 'solid-js/web') gates the TODO-badge visibility and the SOON-badge
// click-blocking/cursor-not-allowed behavior in DashboardMenu.tsx. It resolves to `true` in this
// Vitest environment (dev build condition) by default, so the `!isDev` branches are otherwise
// unreachable. Mocking the module with a controllable getter (instead of vi.resetModules() +
// dynamic re-import) lets tests flip it per-case without invalidating the module registry - doing
// the latter risks re-instantiating solid-js mid-file, which is the "multiple instances of Solid"
// class of bug this test suite's harness was hard-won fixed against.
const isDevBox = vi.hoisted(() => ({ value: true }))
vi.mock('solid-js/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('solid-js/web')>()
  return {
    ...actual,
    get isDev() {
      return isDevBox.value
    },
  }
})

afterEach(() => {
  cleanup()
  isDevBox.value = true
})

function renderAt(path: string) {
  const history = historyAt(path)
  return renderWithProviders(() => <DashboardMenu />, { path: '*', history })
}

describe('components/layout/menu/DashboardMenu.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the guilds section with the Back link pointing at /dashboard/guilds and every guild link', () => {
    renderAt('/dashboard/guilds/g1/config')

    const back = screen.getByText('Back').closest('a')
    expect(back).toHaveAttribute('href', '/dashboard/guilds')

    for (const label of [
      'Informations',
      'Custom Bot',
      'Links',
      'Verification',
      'Auto-Role',
      'Suggestions',
      'Tickets',
      'Servers',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('marks the current guild link and shows its TODO badge', () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    renderAt('/dashboard/guilds/g1/config')

    const informationsLink = screen.getByText('Informations').closest('a')
    expect(informationsLink).toHaveClass('bg-base-200')

    const suggestionsLink = screen.getByText('Suggestions').closest('a')
    expect(suggestionsLink).not.toHaveClass('bg-base-200')
    // Suggestions carries a TODO badge -> badge text rendered, and the base-content styling applied.
    expect(suggestionsLink!.querySelector('.badge')).toHaveTextContent('Todo')
    expect(suggestionsLink).toHaveClass('text-base-content')
  })

  it('renders the servers section (Back to the guild servers list) when the path includes /servers/', () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    renderAt('/dashboard/guilds/g1/config/servers/s1')

    const back = screen.getByText('Back').closest('a')
    expect(back).toHaveAttribute('href', '/dashboard/guilds/g1/config/servers')

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
      'Bans',
      'Tickets',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    const configLink = screen.getByText('Configuration').closest('a')
    expect(configLink!.querySelector('.badge')).toHaveTextContent('New')
    const statusLink = screen.getByText('Status').closest('a')
    expect(statusLink!.querySelector('.badge')).toHaveTextContent('Updated')
  })

  it('marks the current server link', () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    renderAt('/dashboard/guilds/g1/config/servers/s1/roles')

    const rolesLink = screen.getByText('Roles').closest('a')
    expect(rolesLink).toHaveClass('bg-base-200')
    const teamsLink = screen.getByText('Teams').closest('a')
    expect(teamsLink).not.toHaveClass('bg-base-200')
  })

  it('does not block navigation on a SOON-badged link while isDev is true (test env default)', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })
    const rewardsLink = screen.getByText('Rewards').closest('a') as HTMLAnchorElement
    fireEvent.click(rewardsLink)
    // isDev is true, so the SOON/!isDev guard in the onClick handler never fires our own
    // preventDefault(), and the <A> component's own SPA navigation proceeds - observable as a
    // history change to the Rewards URL. See the isDev=false test below for the opposite behavior.
    await vi.waitFor(() => expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1/rewards'))
  })

  it('toggles collapse: hides the Back label and link labels, shows the double-right icon', () => {
    const { container } = renderAt('/dashboard/guilds/g1/config')

    expect(screen.getByText('Collapse')).toBeInTheDocument()
    const collapseRow = screen.getByText('Collapse').closest('div.flex.flex-col.mt-auto')!
    fireEvent.click(collapseRow)

    expect(screen.queryByText('Back')).not.toBeInTheDocument()
    expect(screen.queryByText('Collapse')).not.toBeInTheDocument()
    expect(container.querySelector('.fa-angle-double-right')).toBeInTheDocument()
  })
})

describe('components/layout/menu/DashboardMenu.tsx with isDev=false', () => {
  beforeEach(() => {
    window.localStorage.clear()
    isDevBox.value = false
  })

  it('hides TODO-badged links entirely', () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    renderAt('/dashboard/guilds/g1/config')

    // Suggestions/Tickets (guild section) carry TODO badges -> hidden entirely when !isDev.
    expect(screen.queryByText('Suggestions')).not.toBeInTheDocument()
    expect(screen.queryByText('Tickets')).not.toBeInTheDocument()
    expect(screen.getByText('Informations')).toBeInTheDocument()
  })

  it('applies the not-allowed cursor and blocks navigation on a SOON-badged link', async () => {
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    const history = historyAt('/dashboard/guilds/g1/config/servers/s1')
    renderWithProviders(() => <DashboardMenu />, { path: '*', history })

    // Rewards (servers section) carries a SOON badge.
    const rewardsLink = screen.getByText('Rewards').closest('a') as HTMLAnchorElement
    expect(rewardsLink).toHaveClass('hover:cursor-not-allowed')
    fireEvent.click(rewardsLink)
    // Our onClick's own preventDefault() fires before the <A> component's SPA navigation runs, so
    // the history never changes to the Rewards URL - unlike the isDev=true test above. There's no
    // event to await here (navigation is synchronously blocked), so assert immediately.
    expect(history.get()).toBe('/dashboard/guilds/g1/config/servers/s1')
  })
})
