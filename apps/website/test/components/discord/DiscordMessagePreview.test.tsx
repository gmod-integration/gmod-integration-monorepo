import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { renderWithProviders } from '../../testUtils.js'
import DiscordMessagePreview from '../../../src/components/discord/DiscordMessagePreview.js'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('local Discord message preview', () => {
  it('renders text and embeds together and updates draft text without making a request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const [content, setContent] = createSignal('**Hello** players')
    renderWithProviders(() => (
      <DiscordMessagePreview
        label="Local message"
        author="Gmod Integration"
        content={content()}
        embeds={[
          {
            title: 'Status of **Example**',
            color: 0x5865f2,
            fields: [{ name: 'Players', value: '4/32', inline: true }],
            timestamp: '2026-11-26T12:00:00.000Z',
            imageUrl: null,
          },
        ]}
      />
    ))
    expect(screen.getByRole('region', { name: 'Local message' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Local message' }).querySelector('img')).toHaveAttribute(
      'src',
      '/logo.png',
    )
    expect(screen.getByText('Hello')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getByText('Example')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getByText('4/32')).toBeInTheDocument()
    setContent('Updated `draft`')
    expect(screen.getByText('draft')).toHaveProperty('tagName', 'CODE')
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps user HTML and preview buttons inert instead of executing or navigating', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = renderWithProviders(() => (
      <DiscordMessagePreview
        label="Untrusted message"
        author="<script>author()</script>"
        content={'<img src=x onerror=execute()>\n**Safe formatting**'}
        buttonRows={[[{ label: 'Example action', emoji: '🎮', url: 'javascript:execute()' }]]}
      />
    ))
    expect(screen.getByText('<script>author()</script>')).toBeInTheDocument()
    expect(container).toHaveTextContent('<img src=x onerror=execute()>')
    expect(screen.getByText('Safe formatting')).toHaveProperty('tagName', 'STRONG')
    expect(container.querySelectorAll('script,a')).toHaveLength(0)
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')).toHaveAttribute('src', '/logo.png')
    const action = screen.getByRole('button', { name: 'Example action' })
    expect(action).toHaveAttribute('aria-disabled', 'true')
    await fireEvent.click(action)
    expect(open).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the supplied bot avatar, falls back to the logo on failure and follows identity updates', async () => {
    const [avatarUrl, setAvatarUrl] = createSignal<string | null>('https://cdn.discordapp.com/first.png')
    const { container } = renderWithProviders(() => (
      <DiscordMessagePreview author="Custom bot" avatarUrl={avatarUrl()} />
    ))
    const avatar = () => container.querySelector('img')!
    expect(avatar()).toHaveAttribute('src', 'https://cdn.discordapp.com/first.png')
    await fireEvent.error(avatar())
    expect(avatar()).toHaveAttribute('src', '/logo.png')
    await fireEvent.error(avatar())
    expect(avatar()).toHaveAttribute('src', '/logo.png')
    setAvatarUrl('https://cdn.discordapp.com/second.png')
    expect(avatar()).toHaveAttribute('src', 'https://cdn.discordapp.com/second.png')
    setAvatarUrl(null)
    expect(avatar()).toHaveAttribute('src', '/logo.png')
  })
})
