import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { fetchAPI, getUrlWithActualParams } from '../../../../src/utils/api.js'
import { Errors } from '../../../../src/components/layout/Errors.js'
import GuildBot from '../../../../src/pages/dashboard/guilds/GuildBot.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
}))

vi.mock('../../../../src/components/layout/Errors.js', () => ({
  Errors: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response
}

async function waitForLoaded() {
  await vi.waitFor(() => expect(screen.queryAllByText('Loading...')).toHaveLength(0))
}

function baseBot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bot1',
    username: 'MyBot',
    avatar: 'http://avatar/1.png',
    status: 'disabled',
    custom: true,
    purchased: true,
    onGuild: true,
    active: true,
    token: '',
    ...overrides,
  }
}

describe('pages/dashboard/guilds/GuildBot.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(fetchAPI as any).mockReset()
    ;(getUrlWithActualParams as any).mockReset()
    ;(getUrlWithActualParams as any).mockImplementation((s: string) => s)
    ;(Errors as any).mockReset()
  })

  it('shows loading placeholders while the bot is being fetched', () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot()))
    renderWithProviders(() => <GuildBot />)
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('shows a banner pointing to a custom bot when the bot is not custom', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ custom: false, purchased: false })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() =>
      expect(container.querySelector('.text-indigo-300')?.textContent).toContain(
        "This feature is only available for GmodStore's custom bots.",
      ),
    )
    expect(screen.getByRole('link', { name: 'Get a Custom Bot' })).toHaveAttribute('href', '/gmodstore')
  })

  it('hides the custom-bot banner when the bot is custom', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ custom: true })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(container.querySelector('.text-indigo-300')).not.toBeInTheDocument()
  })

  it('renders bot summary fields and maps known status codes to their labels', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ status: 'playerCount' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByText('MyBot')).toBeInTheDocument())
    const summaryPanel = container.querySelector('div.border.border-base-200.rounded-lg')!
    expect(within(summaryPanel).getByText('Show Player Count')).toBeInTheDocument()
  })

  it('falls back to Unknown for an unrecognized status code', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ status: 'not-a-real-status' })))
    renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByText('Unknown')).toBeInTheDocument())
  })

  it('edits and saves the custom bot from the edit modal', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ username: 'OldName', status: 'disabled' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByText('OldName')).toBeInTheDocument())

    const editModal = container.querySelector('#edit_bot')!
    const [nameInput, avatarInput] = within(editModal).getAllByRole('textbox', { hidden: true }) as HTMLInputElement[]
    expect(nameInput.value).toBe('OldName')
    fireEvent.change(nameInput, { target: { value: 'NewName' } })
    fireEvent.change(avatarInput, { target: { value: 'http://avatar/new.png' } })

    const statusSelect = within(editModal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
    expect(statusSelect.value).toBe('disabled')
    fireEvent.change(statusSelect, { target: { value: 'rotate' } })

    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ username: 'NewName', status: 'rotate' })))
    fireEvent.click(within(editModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(
        '/users/:discordID/guilds/:guildID/bot',
        'PUT',
        expect.objectContaining({ username: 'NewName', avatar: 'http://avatar/new.png', status: 'rotate' }),
      ),
    )
    await vi.waitFor(() => expect(screen.getByText('NewName')).toBeInTheDocument())
  })

  it('reports an error and keeps the previous bot when saving fails', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ username: 'OldName' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByText('OldName')).toBeInTheDocument())

    ;(fetchAPI as any).mockResolvedValue(jsonResponse({}, false))
    const editModal = container.querySelector('#edit_bot')!
    fireEvent.click(within(editModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() =>
      expect(Errors).toHaveBeenCalledWith('An error occurred while saving the bot.'),
    )
    expect(screen.getByText('OldName')).toBeInTheDocument()
  })

  it('sets up the custom bot with a token from the setup modal', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ token: '' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()

    const setupModal = container.querySelector('#setup_bot')!
    const tokenInput = within(setupModal).getByRole('textbox', { hidden: true }) as HTMLInputElement
    fireEvent.change(tokenInput, { target: { value: 'secret-token' } })

    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ token: 'secret-token', active: true })))
    fireEvent.click(within(setupModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/bot', 'PATCH', {
        token: 'secret-token',
      }),
    )
  })

  it('reports an error when the setup token is rejected', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ token: '' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()

    ;(fetchAPI as any).mockResolvedValue(jsonResponse({}, false))
    const setupModal = container.querySelector('#setup_bot')!
    fireEvent.click(within(setupModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() =>
      expect(Errors).toHaveBeenCalledWith('The given token is invalid or intents are missing.'),
    )
  })

  it('hides the whole action row when the bot has not been purchased', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ purchased: false })))
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.queryByRole('button', { name: 'Edit Custom Bot' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join Guild' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Setup Custom Bot' })).not.toBeInTheDocument()
  })

  it('shows Edit Custom Bot only when custom and on the guild, Setup only when active', async () => {
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ purchased: true, custom: true, onGuild: true, active: true })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Join Guild' })).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Setup Custom Bot' })).not.toHaveClass('hidden')
  })

  it('shows Join Guild when purchased+custom but not yet on the guild', async () => {
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ purchased: true, custom: true, onGuild: false, active: false })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Join Guild' })).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Setup Custom Bot' })).toHaveClass('hidden')
  })

  it('hides Edit and Join when the bot is not custom', async () => {
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ purchased: true, custom: false, onGuild: false, active: false })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Join Guild' })).toHaveClass('hidden')
  })

  it('opens the invite window on Join Guild click and refreshes the bot once it closes', async () => {
    vi.useFakeTimers()
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ id: 'bot42', purchased: true, custom: true, onGuild: false })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(fetchAPI).toHaveBeenCalledTimes(1)

    const fakeWindow = { closed: false } as Window
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)

    fireEvent.click(screen.getByRole('button', { name: 'Join Guild' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://discord.com/oauth2/authorize?client_id=bot42&permissions=8&scope=bot&guild_id=:guildID',
      '_blank',
      'width=600,height=900',
    )

    fakeWindow.closed = true
    await vi.advanceTimersByTimeAsync(500)

    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })
})
