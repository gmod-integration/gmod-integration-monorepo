import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import type { StatusMessagePreview } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { renderWithProviders } from '../../testUtils.js'
import DiscordStatusPreview from '../../../src/components/discord/DiscordStatusPreview.js'

const preview: StatusMessagePreview = {
  bot: { name: 'Development bot', avatarUrl: 'https://cdn.discordapp.com/avatar.png' },
  online: true,
  embeds: [
    {
      title: 'Status of **Demo Server**',
      color: 0x393a41,
      timestamp: '2026-11-20T12:00:00.000Z',
      imageUrl: 'data:image/png;base64,aGVsbG8=',
      fields: [
        { name: '📡 Status', value: 'Online', inline: true },
        { name: '\u200b', value: '\n \u200b', inline: true },
        { name: '👤 Players', value: '18/64', inline: true },
        { name: 'Player list', value: '**Alice** — `1h 2m`\n__Bastien__ — ~~offline~~', inline: false },
      ],
    },
  ],
  buttonRows: [
    [
      { label: 'Connect', emoji: '🎮', url: 'steam://connect/192.0.2.10:27015' },
      { label: 'Documentation', emoji: null, url: 'https://example.test/docs' },
    ],
  ],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DiscordStatusPreview', () => {
  it('shows the exact embed fields, bot identity, chart and button rows', () => {
    const { container } = renderWithProviders(() => <DiscordStatusPreview data={preview} />)
    expect(screen.getByText('Development bot')).toBeInTheDocument()
    expect(screen.getByText('Demo Server').tagName).toBe('STRONG')
    expect(screen.getByText('18/64')).toBeInTheDocument()
    expect(screen.getByText('Alice').tagName).toBe('STRONG')
    expect(screen.getByText('1h 2m').tagName).toBe('CODE')
    expect(screen.getByText('Bastien').tagName).toBe('U')
    expect(screen.getByText('offline').tagName).toBe('S')
    expect(screen.getByRole('img', { name: /activity chart/i })).toHaveAttribute('src', preview.embeds[0].imageUrl)
    expect(container.querySelector('time')).toHaveAttribute('datetime', preview.embeds[0].timestamp)
    expect(container.querySelector('[aria-hidden=true]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveAttribute('title', 'steam://connect/192.0.2.10:27015')
  })

  it('renders preview buttons as inactive controls without opening their destination', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderWithProviders(() => <DiscordStatusPreview data={preview} />)
    const button = screen.getByRole('button', { name: 'Documentation' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await fireEvent.click(button)
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('keeps untrusted server text inert and supports an offline preview without attachments', () => {
    const data: StatusMessagePreview = {
      ...preview,
      online: false,
      bot: { name: '<script>bad()</script>', avatarUrl: null },
      buttonRows: [],
      embeds: [
        {
          ...preview.embeds[0],
          title: '<img src=x onerror=bad()>',
          imageUrl: null,
          fields: [{ name: 'Status', value: 'Offline', inline: false }],
        },
      ],
    }
    const { container } = renderWithProviders(() => <DiscordStatusPreview data={data} />)
    expect(screen.getByText('<script>bad()</script>')).toBeInTheDocument()
    expect(screen.getByText('<img src=x onerror=bad()>')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(container.querySelectorAll('script,img')).toHaveLength(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows loading and recoverable errors instead of presenting a failed draft as current', async () => {
    const retry = vi.fn()
    const [loading, setLoading] = createSignal(true)
    const [error, setError] = createSignal<string | undefined>()
    const { container } = renderWithProviders(() => (
      <DiscordStatusPreview data={preview} loading={loading()} error={error()} onRetry={retry} />
    ))
    expect(screen.getByRole('status')).toHaveTextContent('Updating preview')
    expect(container.querySelector('[aria-busy=true]')).toBeInTheDocument()
    setLoading(false)
    setError('The worker is unavailable')
    await Promise.resolve()
    expect(screen.getByRole('alert')).toHaveTextContent('The worker is unavailable')
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(container.querySelector('.opacity-60')).toBeInTheDocument()
  })

  it('handles an empty initial preview and optional error retry callback', () => {
    renderWithProviders(() => <DiscordStatusPreview error="Unavailable" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('clearly identifies fictional players without implying they will be sent to Discord', () => {
    renderWithProviders(() => <DiscordStatusPreview data={{ ...preview, simulation: true }} />)
    expect(screen.getByText('Simulation')).toBeInTheDocument()
    expect(screen.getByText(/fictional players/i)).toBeInTheDocument()
    expect(screen.getByText(/real server data|server.s real data/i)).toBeInTheDocument()
  })
})
