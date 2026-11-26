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
    tokenConfigured: false,
    ...overrides,
  }
}

describe('pages/dashboard/guilds/GuildBot.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true, customBot: true }))
    ;(fetchAPI as any).mockReset()
    ;(getUrlWithActualParams as any).mockReset()
    ;(getUrlWithActualParams as any).mockImplementation((s: string) => s)
  })

  it('shows loading placeholders while the bot is being fetched', () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot()))
    renderWithProviders(() => <GuildBot />)
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('names the custom bot and consequences before removal, and cancellation sends no request', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ tokenConfigured: true })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    expect(dialog.open).toBe(true)
    expect(within(dialog).getByRole('heading', { name: 'Remove MyBot?' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Your GmodStore purchase stays linked to this Discord server/)).toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(dialog.open).toBe(false)
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(0)
  })

  it('removes the custom connection after confirmation and refreshes the main bot without unlinking the purchase', async () => {
    let removed = false
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) => {
      if (method === 'DELETE') {
        removed = true
        return jsonResponse({ removed: true, tokenConfigured: false })
      }
      return jsonResponse(
        baseBot(
          removed ? { custom: false, username: 'Gmod Integration', tokenConfigured: false } : { tokenConfigured: true },
        ),
      )
    })
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await screen.findByText('Custom bot removed. Your GmodStore purchase stays linked.')
    await screen.findByText('Gmod Integration')
    expect(dialog.open).toBe(false)
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'DELETE')).toEqual([
      ['/users/:discordID/guilds/:guildID/bot', 'DELETE'],
    ])
    const connection = screen.getByRole('region', { name: 'Connection and credentials' })
    expect(within(connection).queryByRole('button', { name: 'Remove custom bot' })).not.toBeInTheDocument()
    expect(within(connection).getByRole('button', { name: 'Setup Custom Bot' })).toBeEnabled()
  })

  it('blocks duplicate removals and dismissal until the command completes', async () => {
    let complete!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) =>
      method === 'DELETE' ? new Promise<Response>((resolve) => (complete = resolve)) : jsonResponse(baseBot()),
    )
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    const confirm = within(dialog).getByRole('button', { name: 'Remove custom bot' })
    await fireEvent.click(confirm)
    await fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    const cancellation = new Event('cancel', { cancelable: true })
    await fireEvent(dialog, cancellation)
    expect(cancellation.defaultPrevented).toBe(true)
    expect(dialog.open).toBe(true)
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'DELETE')).toHaveLength(1)
    complete(jsonResponse({ removed: true, tokenConfigured: false }))
    await screen.findByText('Custom bot removed. Your GmodStore purchase stays linked.')
  })

  it('guides the administrator to invite the main bot after a blocked removal', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) =>
      jsonResponse(
        method === 'DELETE' ? { error: 'main_bot_required' } : baseBot({ tokenConfigured: true }),
        method !== 'DELETE',
      ),
    )
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await within(dialog).findByText(/Invite the main Gmod Integration bot to this Discord server, then retry/)
    expect(within(dialog).getByRole('link', { name: 'Invite Main Bot' })).toHaveAttribute('target', '_blank')
    expect(within(dialog).getByRole('link', { name: 'Invite Main Bot' }).getAttribute('href')).toContain(
      'https://discord.com/oauth2/authorize',
    )
    expect(screen.getByText('Token configured')).toBeInTheDocument()
    expect(dialog.open).toBe(true)
  })

  it('reports a removed credential with pending disconnection truthfully and allows retry', async () => {
    let removals = 0
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) => {
      if (method !== 'DELETE') return jsonResponse(baseBot({ tokenConfigured: true }))
      removals += 1
      return removals === 1
        ? jsonResponse({ error: 'custom_bot_disconnect_pending', tokenConfigured: false }, false)
        : jsonResponse({ removed: true, tokenConfigured: false })
    })
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await within(dialog).findByText(
      'The saved token has been removed, but switching to the main bot is not fully confirmed. Retry to finish cleanup.',
    )
    expect(screen.getByText('Token not configured')).toBeInTheDocument()
    expect(screen.queryByText('Custom bot removed. Your GmodStore purchase stays linked.')).not.toBeInTheDocument()
    expect(dialog.open).toBe(true)
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await screen.findByText('Custom bot removed. Your GmodStore purchase stays linked.')
    expect(removals).toBe(2)
  })

  it('keeps removal available after the historical entitlement expires', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false, customBot: false }))
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ purchased: false, active: false })))
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Remove custom bot' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).toBeDisabled()
  })

  it('retains cleanup retry after closing a partial removal whose client was already inactive', async () => {
    let attempts = 0
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) =>
      jsonResponse(
        method === 'DELETE'
          ? attempts++ === 0
            ? { error: 'custom_bot_disconnect_pending', tokenConfigured: false }
            : { error: 'main_bot_unavailable' }
          : baseBot({ custom: false, tokenConfigured: true }),
        method !== 'DELETE',
      ),
    )
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await within(dialog).findByRole('alert')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(dialog.open).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    expect(dialog.open).toBe(true)
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await within(dialog).findByText('We could not verify that the main bot is available. Try again.')
    expect(within(dialog).getByText(/The saved token has been removed/)).toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove custom bot' })).toBeEnabled()
  })

  it('does not report successful removal after an HTTP failure', async () => {
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) =>
      jsonResponse(method === 'DELETE' ? {} : baseBot(), method !== 'DELETE'),
    )
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await within(dialog).findByRole('alert')
    expect(dialog.open).toBe(true)
    expect(screen.queryByText('Custom bot removed. Your GmodStore purchase stays linked.')).not.toBeInTheDocument()
  })

  it.each(['custom_bot_reconfigured', 'custom_bot_state_unavailable'])(
    'requires refresh and a new confirmation after %s without repeating DELETE',
    async (error) => {
      let deletions = 0
      vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) => {
        if (method === 'DELETE') {
          deletions += 1
          return jsonResponse(
            { error, ...(error === 'custom_bot_reconfigured' ? { tokenConfigured: true } : {}) },
            false,
          )
        }
        return jsonResponse(baseBot({ username: deletions ? 'New configuration' : 'MyBot', tokenConfigured: true }))
      })
      const { container } = renderWithProviders(() => <GuildBot />)
      await waitForLoaded()
      await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
      const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
      await within(dialog).findByRole('button', { name: 'Refresh bot information' })
      expect(within(dialog).getByRole('button', { name: 'Remove custom bot' })).toBeDisabled()
      expect(screen.queryByText('Custom bot removed. Your GmodStore purchase stays linked.')).not.toBeInTheDocument()
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
      expect(within(dialog).getByRole('button', { name: 'Remove custom bot' })).toBeDisabled()
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh bot information' }))
      await screen.findByText('New configuration')
      await vi.waitFor(() => expect(dialog.open).toBe(false))
      expect(deletions).toBe(1)
      await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
      expect(within(dialog).getByRole('heading', { name: 'Remove New configuration?' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Remove custom bot' })).toBeEnabled()
      expect(deletions).toBe(1)
    },
  )

  it('keeps the conflict open and blocks another deletion when refreshing fails, then retries the read', async () => {
    let reads = 0
    let deletions = 0
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) => {
      if (method === 'DELETE') {
        deletions += 1
        return jsonResponse({ error: 'custom_bot_reconfigured', tokenConfigured: true }, false)
      }
      reads += 1
      if (reads === 2) return jsonResponse({}, false)
      return jsonResponse(baseBot({ username: reads > 1 ? 'New configuration' : 'MyBot', tokenConfigured: true }))
    })
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await within(dialog).findByRole('button', { name: 'Refresh bot information' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh bot information' }))
    await within(dialog).findByText('Unable to refresh the bot information. Try again.')
    expect(dialog.open).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Remove custom bot' })).toBeDisabled()
    expect(deletions).toBe(1)
    expect(screen.queryByText('Custom bot removed. Your GmodStore purchase stays linked.')).not.toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh bot information' }))
    await screen.findByText('New configuration')
    await vi.waitFor(() => expect(dialog.open).toBe(false))
    expect(reads).toBe(3)
    expect(deletions).toBe(1)
  })

  it.each([null, { removed: false, tokenConfigured: false }, { removed: true, tokenConfigured: true }])(
    'does not accept an incomplete or contradictory successful removal response (%j)',
    async (body) => {
      vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) =>
        jsonResponse(method === 'DELETE' ? body : baseBot()),
      )
      const { container } = renderWithProviders(() => <GuildBot />)
      await waitForLoaded()
      await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
      const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
      await within(dialog).findByRole('alert')
      expect(dialog.open).toBe(true)
      expect(screen.queryByText('Custom bot removed. Your GmodStore purchase stays linked.')).not.toBeInTheDocument()
      expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'GET')).toHaveLength(1)
    },
  )

  it('keeps the acknowledged removal visible when refreshing the bot summary fails', async () => {
    let removed = false
    vi.mocked(fetchAPI).mockImplementation(async (_endpoint, method) => {
      if (method === 'DELETE') {
        removed = true
        return jsonResponse({ removed: true, tokenConfigured: false })
      }
      return jsonResponse(removed ? {} : baseBot(), !removed)
    })
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove custom bot' }))
    const dialog = container.querySelector<HTMLDialogElement>('#remove_bot')!
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove custom bot' }))
    await screen.findByText('Custom bot removed. Your GmodStore purchase stays linked.')
    await screen.findByRole('button', { name: 'Try again' })
    expect(dialog.open).toBe(false)
  })

  it('shows the historical purchase requirement when the community has no custom-bot entitlement', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true, customBot: false }))
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ custom: false, purchased: false })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() =>
      expect(container.querySelector<HTMLElement>('.text-indigo-300')?.textContent).toContain(
        'This feature is reserved for custom bots purchased on GmodStore. A standard Premium subscription does not include custom bots.',
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

  it('names bot membership separately from its configured Discord activity', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ onGuild: false, status: 'disabled' })))
    renderWithProviders(() => <GuildBot />)
    const connection = await screen.findByRole('region', { name: 'Connection and credentials' })
    const identity = screen.getByRole('region', { name: 'Identity and presence' })
    expect(within(connection).getByText('Not in this server')).toBeInTheDocument()
    expect(within(connection).getByRole('button', { name: 'Invite to this Discord server' })).toBeVisible()
    expect(within(identity).getByText('No activity')).toBeInTheDocument()
    expect(within(connection).queryByText('Disconnected')).not.toBeInTheDocument()
  })

  it('edits and saves the custom bot from the edit modal', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ username: 'OldName', status: 'disabled' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await vi.waitFor(() => expect(screen.getByText('OldName')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))

    const editModal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    const nameInput = within(editModal).getByLabelText(/^Name/) as HTMLInputElement
    const avatarInput = within(editModal).getByLabelText('Avatar') as HTMLInputElement
    expect(nameInput.value).toBe('OldName')
    fireEvent.input(nameInput, { target: { value: 'NewName' } })
    await fireEvent.change(avatarInput, {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'avatar.png', { type: 'image/png' })],
      },
    })
    await within(editModal).findByAltText('New avatar preview')

    const statusSelect = within(editModal).getByRole('combobox', { hidden: true }) as HTMLSelectElement
    expect(statusSelect.value).toBe('disabled')
    fireEvent.change(statusSelect, { target: { value: 'rotate' } })

    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ username: 'NewName', status: 'rotate' })))
    fireEvent.click(within(editModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith(
        '/users/:discordID/guilds/:guildID/bot',
        'PUT',
        expect.objectContaining({
          username: 'NewName',
          avatar: expect.stringMatching(/^data:image\/png;base64,/),
          status: 'rotate',
        }),
      ),
    )
    await vi.waitFor(() => expect(screen.getByText('NewName')).toBeInTheDocument())
  })

  it('keeps saved credentials out of profile requests and opens replacement with an empty secret', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ tokenConfigured: true })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await screen.findByText('Token configured')
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))
    const setup = container.querySelector<HTMLDialogElement>('#setup_bot')!
    expect(within(setup).getByLabelText(/^Bot token/)).toHaveValue('')
    await fireEvent.click(within(setup).getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const editor = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(editor).getByLabelText(/^Name/), { target: { value: 'Renamed bot' } })
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ tokenConfigured: true, username: 'Renamed bot' })))
    await fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(editor.open).toBe(false))
    expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/bot', 'PUT', { username: 'Renamed bot' })
  })

  it('discards a pending avatar selection on cancel and keeps the current avatar unless a replacement is selected', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const editor = container.querySelector<HTMLDialogElement>('#edit_bot')!
    const upload = within(editor).getByLabelText('Avatar')
    await fireEvent.change(upload, {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'avatar.png', { type: 'image/png' })],
      },
    })
    await within(editor).findByAltText('New avatar preview')
    await fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    expect(within(editor).queryByAltText('New avatar preview')).not.toBeInTheDocument()
    expect(within(editor).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
  })

  it('lets the administrator keep the current avatar after previewing a replacement', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const editor = within(container.querySelector<HTMLDialogElement>('#edit_bot')!)
    await fireEvent.change(editor.getByLabelText('Avatar'), {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'avatar.png', { type: 'image/png' })],
      },
    })
    await editor.findByAltText('New avatar preview')
    await fireEvent.click(editor.getByRole('button', { name: 'Keep current avatar' }))
    expect(editor.queryByAltText('New avatar preview')).not.toBeInTheDocument()
    expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
  })

  it.each(['read_error', 'invalid_result'])('keeps the saved avatar when the chosen image has %s', async (failure) => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      if (failure === 'invalid_result')
        Object.defineProperty(this, 'result', { value: 'data:image/png;base64,invalid-image' })
      this.dispatchEvent(new ProgressEvent(failure === 'read_error' ? 'error' : 'load'))
    })
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const editor = within(container.querySelector<HTMLDialogElement>('#edit_bot')!)
    await fireEvent.change(editor.getByLabelText('Avatar'), {
      target: { files: [new File(['image'], 'avatar.png', { type: 'image/png' })] },
    })
    expect(
      editor.getByText(
        failure === 'read_error'
          ? 'Unable to read this image. Choose it again.'
          : 'Choose a PNG or JPEG image up to 2 MiB.',
      ),
    ).toBeInTheDocument()
    expect(editor.queryByAltText('New avatar preview')).not.toBeInTheDocument()
    expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
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

  it('blocks invalid bot names and unsupported avatar uploads without saving', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(modal).getByLabelText(/^Name/), { target: { value: ' ' } })
    await fireEvent.change(within(modal).getByLabelText('Avatar'), {
      target: { files: [new File(['unsupported'], 'avatar.svg', { type: 'image/svg+xml' })] },
    })
    expect(within(modal).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0)
  })

  it('registers identity, secret and removal navigation guards and unregisters them on unmount', async () => {
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
    expect(entries).toHaveLength(3)
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
    await fireEvent.input(within(setup).getByLabelText(/^Bot token/), { target: { value: 'secret-draft' } })
    expect(entries[1].dirty()).toBe(true)
    entries[1].discard()
    expect(within(setup).getByLabelText(/^Bot token/)).toHaveValue('')
    unmount()
    expect(unregister).toHaveBeenCalledTimes(3)
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
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ tokenConfigured: false })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))

    const setupModal = container.querySelector<HTMLDialogElement>('#setup_bot')!
    const tokenInput = within(setupModal).getByLabelText(/^Bot token/) as HTMLInputElement
    fireEvent.input(tokenInput, { target: { value: 'secret-token' } })

    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ tokenConfigured: true, active: true })))
    fireEvent.click(within(setupModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() =>
      expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/bot', 'PATCH', {
        token: 'secret-token',
      }),
    )
  })

  it('reports an error when the setup token is rejected', async () => {
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ tokenConfigured: false })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))

    ;(fetchAPI as any).mockResolvedValue(jsonResponse({}, false))
    const setupModal = container.querySelector<HTMLDialogElement>('#setup_bot')!
    await fireEvent.input(within(setupModal).getByLabelText(/^Bot token/), { target: { value: 'rejected-token' } })
    fireEvent.click(within(setupModal).getByRole('button', { name: 'Save', hidden: true }))

    await vi.waitFor(() => expect(within(setupModal).getByRole('alert')).toBeInTheDocument())
    expect(setupModal.open).toBe(true)
    expect(within(setupModal).getByLabelText(/^Bot token/)).toHaveValue('rejected-token')
  })

  it('discards the setup secret on Cancel and reopens with an empty draft', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))
    const modal = container.querySelector<HTMLDialogElement>('#setup_bot')!
    await fireEvent.input(within(modal).getByLabelText(/^Bot token/), { target: { value: 'secret-to-discard' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(modal.open).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: 'Setup Custom Bot' }))
    expect(within(modal).getByLabelText(/^Bot token/)).toHaveValue('')
    expect(within(modal).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PATCH')).toHaveLength(0)
  })

  it('opens each card action in its own editor and keeps a canceled secret out of identity saves', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot()))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    const identity = screen.getByText('Identity and presence').closest('.dashboard-panel') as HTMLElement
    const connection = screen.getByText('Connection and credentials').closest('.dashboard-panel') as HTMLElement
    await fireEvent.click(within(connection).getByRole('button', { name: 'Setup Custom Bot' }))
    const setup = container.querySelector<HTMLDialogElement>('#setup_bot')!
    await fireEvent.input(within(setup).getByLabelText(/^Bot token/), { target: { value: 'discarded-secret' } })
    await fireEvent.click(within(setup).getByRole('button', { name: 'Cancel' }))

    await fireEvent.click(within(identity).getByRole('button', { name: 'Edit Custom Bot' }))
    const editor = container.querySelector<HTMLDialogElement>('#edit_bot')!
    await fireEvent.input(within(editor).getByLabelText(/^Name/), { target: { value: 'Updated identity' } })
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ username: 'Updated identity' })))
    await fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(editor.open).toBe(false))
    expect(vi.mocked(fetchAPI).mock.calls.filter(([, method]) => method === 'PATCH')).toHaveLength(0)
    expect(fetchAPI).toHaveBeenCalledWith('/users/:discordID/guilds/:guildID/bot', 'PUT', {
      username: 'Updated identity',
    })
    expect(within(connection).getByRole('button', { name: 'Setup Custom Bot' })).toBeEnabled()
  })

  it('allows disabling the saved premium presence while preserving custom bot access', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false, customBot: true }))
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ status: 'playerCount' })))
    const { container } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Custom Bot' }))
    const modal = container.querySelector<HTMLDialogElement>('#edit_bot')!
    expect(within(modal).getByText(/This saved feature is suspended\./)).toBeInTheDocument()
    await fireEvent.change(within(modal).getByLabelText('Discord activity'), { target: { value: 'disabled' } })
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ status: 'disabled' })))
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal.open).toBe(false))
    expect(fetchAPI).toHaveBeenCalledWith(
      '/users/:discordID/guilds/:guildID/bot',
      'PUT',
      expect.objectContaining({ status: 'disabled' }),
    )
  })

  it('explains blocked invite popups and lets the user retry the invitation', async () => {
    vi.mocked(fetchAPI).mockResolvedValue(jsonResponse(baseBot({ onGuild: false })))
    const { unmount } = renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ closed: false } as Window)
    await fireEvent.click(screen.getByRole('button', { name: 'Invite to this Discord server' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Allow pop-ups for this site to invite the bot.')
    await fireEvent.click(screen.getByRole('button', { name: 'Invite to this Discord server' }))
    expect(open).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    unmount()
  })

  it('keeps the custom bot action visible but disabled without its historical entitlement', async () => {
    localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true, customBot: false }))
    ;(fetchAPI as any).mockResolvedValue(jsonResponse(baseBot({ purchased: false })))
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Invite to this Discord server' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Setup Custom Bot' })).not.toBeInTheDocument()
  })

  it('shows Edit Custom Bot only when custom and on the guild, Setup only when active', async () => {
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ purchased: true, custom: true, onGuild: true, active: true })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Invite to this Discord server' })).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Setup Custom Bot' })).not.toHaveClass('hidden')
  })

  it('shows Join Guild when purchased+custom but not yet on the guild', async () => {
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ purchased: true, custom: true, onGuild: false, active: false })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Invite to this Discord server' })).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Setup Custom Bot' })).toHaveClass('hidden')
  })

  it('hides Edit and Join when the bot is not custom', async () => {
    ;(fetchAPI as any).mockResolvedValue(
      jsonResponse(baseBot({ purchased: true, custom: false, onGuild: false, active: false })),
    )
    renderWithProviders(() => <GuildBot />)
    await waitForLoaded()
    expect(screen.getByRole('button', { name: 'Edit Custom Bot' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Invite to this Discord server' })).toHaveClass('hidden')
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

    fireEvent.click(screen.getByRole('button', { name: 'Invite to this Discord server' }))

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
