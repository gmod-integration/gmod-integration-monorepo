import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { fireEvent } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { setIsLogged } from '../../../../src/utils/event.js'
import { fetchAPI } from '../../../../src/utils/api.js'
import GuildsSelector from '../../../../src/pages/dashboard/guilds/GuildsSelector.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data))
}

const guilds = [
  { id: 'g1', name: 'Beta', isPremium: true, hasBot: true, isOwner: true, icon: null },
  { id: 'g2', name: 'Alpha', isPremium: true, hasBot: true, isOwner: false, icon: 'http://icon/g2.png' },
  { id: 'g3', name: 'Gamma', isPremium: false, hasBot: true, isOwner: false, icon: null },
  { id: 'g4', name: 'Delta', isPremium: false, hasBot: false, isOwner: true, icon: null },
]

describe('pages/dashboard/guilds/GuildsSelector.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setIsLogged(true)
    ;(fetchAPI as any).mockReset()
  })

  it('shows a loading spinner while guilds are being fetched', () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse([]))
    const { container } = renderWithProviders(() => <GuildsSelector />)
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument()
  })

  it('shows an error message when fetching guilds fails', async () => {
    ;(fetchAPI as any).mockRejectedValue(new Error('network down'))
    renderWithProviders(() => <GuildsSelector />)
    await vi.waitFor(() => expect(screen.getByText('Failed to fetch your guilds')).toBeInTheDocument())
  })

  it('redirects to /login when the user is not logged in', async () => {
    setIsLogged(false)
    ;(fetchAPI as any).mockResolvedValue(jsonResponse([]))
    const history = historyAt('/dashboard/guilds')
    renderWithProviders(() => <GuildsSelector />, { path: '/dashboard/guilds', history })
    await vi.waitFor(() => expect(history.get()).toBe('/login'))
  })

  it('does not redirect when the user is logged in', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse([]))
    const history = historyAt('/dashboard/guilds')
    renderWithProviders(() => <GuildsSelector />, { path: '/dashboard/guilds', history })
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalled())
    expect(history.get()).toBe('/dashboard/guilds')
  })

  it('clears server and guilds from localStorage on mount', () => {
    window.localStorage.setItem('server', JSON.stringify({ id: 's1' }))
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    ;(fetchAPI as any).mockResolvedValue(jsonResponse([]))
    renderWithProviders(() => <GuildsSelector />)
    expect(window.localStorage.getItem('server')).toBeNull()
    expect(window.localStorage.getItem('guilds')).toBeNull()
  })

  it('renders the create-guild link', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse([]))
    renderWithProviders(() => <GuildsSelector />)
    const link = screen.getByText('Create Guild').closest('a')
    expect(link).toHaveAttribute('href', 'discord://-/guilds/create')
  })

  it('sorts guilds by isPremium, then hasBot, then name, and renders their details', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(guilds))
    const { container } = renderWithProviders(() => <GuildsSelector />)

    await vi.waitFor(() => expect(container.querySelectorAll('a.shadowHover')).toHaveLength(4))

    const names = Array.from(container.querySelectorAll('a.shadowHover h3')).map((el) => el.textContent)
    // premium guilds (Alpha, Beta) before non-premium; within premium group sorted by name;
    // within non-premium group, hasBot=true (Gamma) before hasBot=false (Delta)
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])

    const cards = Array.from(container.querySelectorAll('a.shadowHover'))
    const betaCard = cards.find((c) => c.querySelector('h3')?.textContent === 'Beta')!
    expect(betaCard.querySelector('.fa-crown')).toBeInTheDocument()
    expect(betaCard.textContent).toContain('Owner')
    expect(betaCard.textContent).toContain('Manage')
    expect(betaCard.querySelector('img')).toHaveAttribute('src', expect.stringContaining('defaultGuild'))

    const alphaCard = cards.find((c) => c.querySelector('h3')?.textContent === 'Alpha')!
    expect(alphaCard.textContent).toContain('Admin')
    expect(alphaCard.querySelector('img')).toHaveAttribute('src', 'http://icon/g2.png')

    const gammaCard = cards.find((c) => c.querySelector('h3')?.textContent === 'Gamma')!
    expect(gammaCard.querySelector('.fa-crown')).not.toBeInTheDocument()

    const deltaCard = cards.find((c) => c.querySelector('h3')?.textContent === 'Delta')!
    expect(deltaCard.textContent).toContain('Add Bot')
  })

  it('stores the guild in localStorage when clicking a guild that already has the bot', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(guilds))
    const { container } = renderWithProviders(() => <GuildsSelector />)
    await vi.waitFor(() => expect(container.querySelectorAll('a.shadowHover')).toHaveLength(4))

    const betaCard = Array.from(container.querySelectorAll('a.shadowHover')).find(
      (c) => c.querySelector('h3')?.textContent === 'Beta',
    )!
    fireEvent.click(betaCard)

    expect(JSON.parse(window.localStorage.getItem('guilds')!)).toMatchObject({ id: 'g1', name: 'Beta' })
  })

  it('opens an invite popup and refetches once it is closed when clicking a guild without the bot', async () => {
    vi.useFakeTimers()
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(guilds))
    const { container } = renderWithProviders(() => <GuildsSelector />)
    await vi.waitFor(() => expect(container.querySelectorAll('a.shadowHover')).toHaveLength(4))
    expect(fetchAPI).toHaveBeenCalledTimes(1)

    const fakeWindow = { closed: false } as Window
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)

    const deltaCard = Array.from(container.querySelectorAll('a.shadowHover')).find(
      (c) => c.querySelector('h3')?.textContent === 'Delta',
    )!
    fireEvent.click(deltaCard)

    expect(openSpy).toHaveBeenCalledWith('/invite&guild_id=g4', '_blank', 'width=600,height=900')
    expect(window.localStorage.getItem('guilds')).toBeNull()

    fakeWindow.closed = true
    await vi.advanceTimersByTimeAsync(500)

    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })
})
