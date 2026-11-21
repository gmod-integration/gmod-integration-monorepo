import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { fetchAPI, getUrlWithActualParams } from '../../../../src/utils/api.js'
import { DraftRegistryContext, type DraftEntry } from '../../../../src/hooks/draftRegistry.js'
import GuildBot from '../../../../src/pages/dashboard/guilds/GuildBot.js'

vi.mock('../../../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(),
  getUrlWithActualParams: vi.fn((s: string) => s),
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
      expect(container.querySelector<HTMLElement>('.text-indigo-300')?.textContent).toContain(
        "This feature is only available for GmodStore's custom bots.",
      ),
    )
    expect(screen.getByRole('link', { name: 'Get a Custom Bot' })).toHaveAttribute('href', '/gmodstore')
  })

  it('hides the custom-bot banner when the bot is custom', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ custom: true })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(container.querySelector<HTMLElement>('.text-indigo-300')).not.toBeInTheDocument()
  })

  it('renders bot summary fields and maps known status codes to their labels', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ status: 'playerCount' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByText('MyBot')).toBeInTheDocument())
    const summaryPanel = container.querySelector<HTMLElement>('dl')!
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
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))

    const editModal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    const [nameInput, avatarInput] = within(editModal).getAllByRole('textbox', { hidden: true }) as HTMLInputElement[]
    expect(nameInput.value).toBe('OldName')
    fireEvent.input(nameInput, { target: { value: 'NewName' } })
    fireEvent.input(avatarInput, { target: { value: 'http://avatar/new.png' } })

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
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))

    ;(fetchAPI as any).mockResolvedValue(jsonResponse({}, false))
    const editModal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(editModal).getByLabelText(/^Name/), { target: { value: 'Unsaved name' } })
    fireEvent.click(within(editModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() => expect(within(editModal).getByRole('alert')).toBeInTheDocument())
    expect(editModal.open).toBe(true)
    expect(within(editModal).getByLabelText(/^Name/)).toHaveValue('Unsaved name')
    expect(screen.getByText('OldName')).toBeInTheDocument()
  })

  it('keeps edits local and restores the saved bot when the editor is canceled', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    const edit = screen.getByRole('button', { name: 'Edit Custom Bot' })
    await fireEvent.click(edit)
    const modal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(modal).getByLabelText(/^Name/), { target: { value: 'Draft bot' } })
    expect(screen.getByText('MyBot')).toBeInTheDocument()
    expect(screen.queryByText('Draft bot')).not.toBeInTheDocument()
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(modal.open).toBe(false)
    await fireEvent.click(edit)
    expect(within(modal).getByLabelText(/^Name/)).toHaveValue('MyBot')
    expect((fetchAPI as any).mock.calls.filter(([, method]: string[]) => method === 'PUT')).toHaveLength(0)
  })

  it('prevents duplicate saves and closes the editor only after a successful response', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(modal).getByLabelText(/^Name/), { target: { value: 'Saved bot' } })
    let resolveSave!: (response: Response) => void
    ;(fetchAPI as any).mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)))
    const save = within(modal).getByRole('button', { name: 'Save' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect((fetchAPI as any).mock.calls.filter(([, method]: string[]) => method === 'PUT')).toHaveLength(1)
    expect(save).toBeDisabled()
    expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(modal).getByLabelText(/^Name/)).toBeDisabled()
    expect(modal.open).toBe(true)
    resolveSave(jsonResponse(baseBot({ username: 'Saved bot' })))
    await vi.waitFor(() => expect(modal.open).toBe(false))
    expect(screen.getByText('Saved bot')).toBeInTheDocument()
  })

  it('blocks invalid bot names and unsafe avatar URLs without saving', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(modal).getByLabelText(/^Name/), { target: { value: ' ' } })
    await fireEvent.input(within(modal).getByLabelText('Avatar'), { target: { value: 'javascript:alert(1)' } })
    expect(within(modal).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
  })

  it('registers identity and secret drafts with the navigation guard and unregisters them on unmount', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const entries: DraftEntry[] = []
    const unregister = vi.fn()
    const { container, unmount } = renderWithProviders(() => (
      <DraftRegistryContext.Provider
        value={{
          register: (entry) => {
            entries.push(entry)
            return unregister
          },
        }}
      >
        <GuildBot />
      </DraftRegistryContext.Provider>
    ))
    await waitForLoaded()
    expect(entries).toHaveLength(2)
    expect(entries.every((entry) => !entry.dirty())).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(modal).getByLabelText(/^Name/), { target: { value: 'Draft' } })
    expect(entries[0].dirty()).toBe(true)
    entries[0].discard()
    expect(within(modal).getByLabelText(/^Name/)).toHaveValue('MyBot')
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))
    const setup = container.querySelector<HTMLDialogElement>('#setup_bot')!
    await fireEvent.input(within(setup).getByLabelText(/^Token/), { target: { value: 'secret-draft' } })
    expect(entries[1].dirty()).toBe(true)
    entries[1].discard()
    expect(within(setup).getByLabelText(/^Token/)).toHaveValue('')
    unmount()
    expect(unregister).toHaveBeenCalledTimes(2)
  })

  it('shows an error with retry instead of reading a failed bot resource', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse({}, false))
    renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot()))
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.getByText('MyBot')).toBeInTheDocument())
  })

  it('sets up the custom bot with a token from the setup modal', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ token: '' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))

    const setupModal = container.querySelector<HTMLDialogElement>('#setup_bot')!
    const tokenInput = within(setupModal).getByLabelText(/Token/) as HTMLInputElement
    fireEvent.input(tokenInput, { target: { value: 'secret-token' } })

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
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))

    ;(fetchAPI as any).mockResolvedValue(jsonResponse({}, false))
    const setupModal = container.querySelector<HTMLDialogElement>('#setup_bot')!
    await fireEvent.input(within(setupModal).getByLabelText(/Token/), { target: { value: 'rejected-token' } })
    fireEvent.click(within(setupModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() => expect(within(setupModal).getByRole('alert')).toBeInTheDocument())
    expect(setupModal.open).toBe(true)
    expect(within(setupModal).getByLabelText(/Token/)).toHaveValue('rejected-token')
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

    let popupClosed = false
    const fakeWindow = {
      get closed() {
        return popupClosed
      },
    } as Window
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)

    fireEvent.click(screen.getByRole('button', { name: 'Join Guild' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://discord.com/oauth2/authorize?client_id=bot42&permissions=8&scope=bot&guild_id=:guildID',
      '_blank',
      'width=600,height=900',
    )

    popupClosed = true
    await vi.advanceTimersByTimeAsync(500)

    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })
})
