import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveDiscordGuildClient,
  buildDiscordStatusMessage,
  setDiscordGuildClientResolver,
  setDiscordStatusMessageBuilder,
} from '../src/discordBridge.js'

// module-level resolver/builder state is shared across tests in this file - always reset it in
// afterEach so tests don't leak configuration into each other.
describe('discordBridge', () => {
  afterEach(() => {
    // @ts-expect-error resetting private module state between tests
    setDiscordGuildClientResolver(undefined)
    // @ts-expect-error resetting private module state between tests
    setDiscordStatusMessageBuilder(undefined)
  })

  it('resolveDiscordGuildClient throws when no resolver has been configured', async () => {
    await expect(resolveDiscordGuildClient('g1')).rejects.toThrow('Discord guild client resolver is not configured')
  })

  it('resolveDiscordGuildClient delegates to the configured resolver', async () => {
    const resolver = vi.fn().mockResolvedValue({ id: 'client1' })
    setDiscordGuildClientResolver(resolver)

    const result = await resolveDiscordGuildClient('g1', false)

    expect(resolver).toHaveBeenCalledWith('g1', false)
    expect(result).toEqual({ id: 'client1' })
  })

  it('resolveDiscordGuildClient defaults forcePresenceOnGuild to true', async () => {
    const resolver = vi.fn().mockResolvedValue({})
    setDiscordGuildClientResolver(resolver)

    await resolveDiscordGuildClient('g1')

    expect(resolver).toHaveBeenCalledWith('g1', true)
  })

  it('buildDiscordStatusMessage throws when no builder has been configured', async () => {
    await expect(buildDiscordStatusMessage({} as any, {}, 'en')).rejects.toThrow(
      'Discord status message builder is not configured',
    )
  })

  it('buildDiscordStatusMessage delegates to the configured builder', async () => {
    const builder = vi.fn().mockResolvedValue({ embeds: [] })
    setDiscordStatusMessageBuilder(builder)

    const server = {} as any
    const data = { players: 1 }
    const result = await buildDiscordStatusMessage(server, data, 'en')

    expect(builder).toHaveBeenCalledWith(server, data, 'en')
    expect(result).toEqual({ embeds: [] })
  })
})
