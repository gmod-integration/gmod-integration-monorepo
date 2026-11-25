import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import type { PlayerProfileResponse } from '@gmod/schema/user/PlayerProfileSchema.js'
import PlayerProfileActions from '../../src/components/PlayerProfileActions.js'
import { renderWithProviders } from '../testUtils.js'

const STEAM = '76561198000000001'
const OTHER_STEAM = '76561198000000002'
const canonicalUrl = (steamID64 = STEAM) => `http://localhost:3000/players/steam/${steamID64}`
const writeText = vi.fn<(value: string) => Promise<void>>()

function profile(steamID64 = STEAM): PlayerProfileResponse {
  return {
    player: { steamID64, discordID: null, name: 'Ely', avatarURL: null, trustLevel: null, registeredAt: null },
    summary: {
      servers: 0,
      totalTime: 0,
      kills: 0,
      deaths: 0,
      connections: 0,
      firstJoinedAt: null,
      lastSeenAt: null,
    },
    servers: [],
    pagination: { total: 0, limit: 10, offset: 0 },
    moderation: {
      warnings: [],
      bans: [],
      warningsPagination: { total: 0, limit: 10, offset: 0 },
      bansPagination: { total: 0, limit: 10, offset: 0 },
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  writeText.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('player profile actions', () => {
  it('shares a canonical Steam profile URL through the native share sheet and blocks duplicate actions', async () => {
    let complete!: () => void
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    renderWithProviders(() => <PlayerProfileActions profile={profile()} />, { session: false })
    const button = screen.getByRole('button', { name: 'Share profile' })

    await fireEvent.click(button)
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: 'Ely — player profile', url: canonicalUrl() })
    expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copy profile link' })).toBeDisabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(button)
    expect(share).toHaveBeenCalledOnce()

    complete()
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Profile shared.'))
    expect(button).toBeEnabled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies the canonical link when native sharing is unavailable', async () => {
    renderWithProviders(() => <PlayerProfileActions profile={profile()} />, { session: false })
    await fireEvent.click(screen.getByRole('button', { name: 'Share profile' }))

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Profile link copied.'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(canonicalUrl())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to copying when the native share API rejects an unsupported operation', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Unsupported', 'NotSupportedError'))
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    renderWithProviders(() => <PlayerProfileActions profile={profile()} />, { session: false })
    await fireEvent.click(screen.getByRole('button', { name: 'Share profile' }))

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Profile link copied.'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(canonicalUrl())
  })

  it('treats cancellation of native sharing as a cancellation without copying or reporting failure', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    renderWithProviders(() => <PlayerProfileActions profile={profile()} />, { session: false })
    const button = screen.getByRole('button', { name: 'Share profile' })
    await fireEvent.click(button)

    await vi.waitFor(() => expect(button).toBeEnabled())
    expect(share).toHaveBeenCalledOnce()
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows clipboard failures and permits retry without displaying a false success', async () => {
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'))
    renderWithProviders(() => <PlayerProfileActions profile={profile()} />, { session: false })
    const button = screen.getByRole('button', { name: 'Share profile' })
    await fireEvent.click(button)

    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to share or copy this profile. Please try again.'),
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(button).toBeEnabled()
    await fireEvent.click(button)
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Profile link copied.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('offers explicit link copying and a support Discord report link in a separate tab', async () => {
    renderWithProviders(() => <PlayerProfileActions profile={profile()} />, { session: false })
    const report = screen.getByRole('link', { name: 'Report player' })
    expect(report).toHaveAttribute('href', '/discord')
    expect(report).toHaveAttribute('target', '_blank')
    expect(report).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(/Reports are handled through Discord support/)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Copy profile link' }))
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied!'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(canonicalUrl())
  })

  it('does not show a stale sharing confirmation after navigating to another player', async () => {
    let complete!: () => void
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    const [current, setCurrent] = createSignal(profile())
    renderWithProviders(() => <PlayerProfileActions profile={current()} />, { session: false })
    const button = screen.getByRole('button', { name: 'Share profile' })
    await fireEvent.click(button)
    setCurrent(profile(OTHER_STEAM))
    complete()

    await vi.waitFor(() => expect(button).toBeEnabled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Copy profile link' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(canonicalUrl(OTHER_STEAM)))
  })

  it('does not copy an old player link if its native share fails after the selected player changes', async () => {
    let rejectShare!: (error: Error) => void
    const share = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectShare = reject
        }),
    )
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    const [current, setCurrent] = createSignal(profile())
    renderWithProviders(() => <PlayerProfileActions profile={current()} />, { session: false })
    const button = screen.getByRole('button', { name: 'Share profile' })
    await fireEvent.click(button)
    setCurrent(profile(OTHER_STEAM))
    rejectShare(new Error('Native sharing failed'))

    await vi.waitFor(() => expect(button).toBeEnabled())
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
