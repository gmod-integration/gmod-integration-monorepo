import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'

vi.mock('../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/utils/api.js')>()
  return {
    ...actual,
    fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  }
})

const { guildChannelsMutate } = await import('../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: DiscordMessage } = await import('../../../src/components/discord/DiscordMessage.js')

afterEach(() => cleanup())

describe('components/discord/DiscordMessage.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    guildChannelsMutate([{ id: 'c1', name: 'general', type: 0, position: 0, parentID: null }])
  })

  it('renders nothing when neither channelID nor channel is provided', () => {
    const { container } = render(() => <DiscordMessage messageID="m1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('resolves the channel from guildChannels by channelID and renders name + message link icon', () => {
    const { container } = render(() => <DiscordMessage channelID="c1" messageID="m1" />)
    expect(screen.getByText(/#general/)).toBeInTheDocument()
    expect(container.querySelector('.fa-comment')).toBeInTheDocument()
  })

  it('renders nothing when channelID does not match any known channel', () => {
    const { container } = render(() => <DiscordMessage channelID="does-not-exist" messageID="m1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('uses the channel prop directly when provided, bypassing guildChannels lookup', () => {
    render(() => (
      <DiscordMessage channel={{ id: 'c2', name: 'other-channel', type: 0, position: 1, parentID: null }} messageID="m2" />
    ))
    expect(screen.getByText(/#other-channel/)).toBeInTheDocument()
  })

  it('builds an href pointing at the discord message using the actual guild id', () => {
    render(() => <DiscordMessage channelID="c1" messageID="m1" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://discord.com/channels/g1/c1/m1')
  })
})
