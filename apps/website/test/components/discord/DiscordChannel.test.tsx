import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'

vi.mock('../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/utils/api.js')>()
  return {
    ...actual,
    fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  }
})

const { guildChannelsMutate, guildChannelsRefetch } =
  await import('../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: DiscordChannel } = await import('../../../src/components/discord/DiscordChannel.js')

const { fetchAPI } = await import('../../../src/utils/api.js')
const knownChannel = { id: 'c1', name: 'general', type: 0, position: 0, parentID: null }

afterEach(async () => {
  cleanup()
  vi.mocked(fetchAPI)
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => [] } as Response)
  await guildChannelsRefetch()
})

describe('components/discord/DiscordChannel.tsx', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1' }))
    vi.mocked(fetchAPI)
      .mockReset()
      .mockResolvedValue({ ok: true, json: async () => [knownChannel] } as Response)
    await guildChannelsRefetch()
  })

  it('renders nothing when neither channelID nor channel is provided', () => {
    const { container } = render(() => <DiscordChannel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('resolves the channel from guildChannels by channelID and renders its name', () => {
    render(() => <DiscordChannel channelID="c1" />)
    expect(screen.getByText('#general')).toBeInTheDocument()
  })

  it('renders nothing when channelID does not match any known channel', () => {
    const { container } = render(() => <DiscordChannel channelID="does-not-exist" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('uses the channel prop directly when provided, bypassing guildChannels lookup', () => {
    render(() => <DiscordChannel channel={{ id: 'c2', name: 'other-channel', type: 0, position: 1, parentID: null }} />)
    expect(screen.getByText('#other-channel')).toBeInTheDocument()
  })

  it('builds an href pointing at the discord channel using the actual guild id', () => {
    render(() => <DiscordChannel channelID="c1" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://discord.com/channels/g1/c1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('updates when the channel id or shared channel data changes', () => {
    const [channelID, setChannelID] = createSignal('unknown')
    const { container } = render(() => <DiscordChannel channelID={channelID()} />)
    expect(container).toBeEmptyDOMElement()
    setChannelID('c1')
    expect(screen.getByText('#general')).toBeInTheDocument()
    guildChannelsMutate([{ ...knownChannel, name: 'renamed' }])
    expect(screen.getByText('#renamed')).toBeInTheDocument()
  })

  it('recovers from pending and failed channel requests without throwing from the renderer', async () => {
    let resolveChannels!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveChannels = resolve
        }),
    )
    const request = guildChannelsRefetch()
    const { container } = render(() => <DiscordChannel channelID="c1" />)
    expect(container).toBeEmptyDOMElement()
    resolveChannels({ ok: true, json: async () => [knownChannel] } as Response)
    await request
    expect(screen.getByText('#general')).toBeInTheDocument()

    vi.mocked(fetchAPI).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    await guildChannelsRefetch()
    expect(container).toBeEmptyDOMElement()
    vi.mocked(fetchAPI).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ ...knownChannel, name: 'renamed' }],
    } as Response)
    await guildChannelsRefetch()
    expect(screen.getByText('#renamed')).toBeInTheDocument()
  })

  it('uses an explicit channel even when the shared channel request has failed', async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    await guildChannelsRefetch()
    render(() => <DiscordChannel channel={knownChannel} />)
    expect(screen.getByText('#general')).toBeInTheDocument()
  })
})
