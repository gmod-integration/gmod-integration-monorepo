import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'

vi.mock('../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/utils/api.js')>()
  return {
    ...actual,
    fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  }
})

const { guildRolesMutate } = await import('../../../src/pages/dashboard/guilds/GuildInformations.js')
const { default: DiscordRole } = await import('../../../src/components/discord/DiscordRole.js')

afterEach(() => cleanup())

describe('components/discord/DiscordRole.tsx', () => {
  beforeEach(() => {
    guildRolesMutate([{ id: 'r1', name: 'Moderator', color: 123456, colorHex: '#1e2a3f' }])
  })

  it('renders nothing when neither role nor roleID is provided', () => {
    const { container } = render(() => <DiscordRole />)
    expect(container).toBeEmptyDOMElement()
  })

  it('resolves the role from guildRoles by roleID and renders its name with its color', () => {
    render(() => <DiscordRole roleID="r1" />)
    const el = screen.getByText('@Moderator')
    expect(el).toHaveStyle({ color: '#1e2a3f' })
  })

  it('renders nothing when roleID does not match any known role', () => {
    const { container } = render(() => <DiscordRole roleID="does-not-exist" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('uses the role prop directly when provided, bypassing guildRoles lookup', () => {
    render(() => <DiscordRole role={{ id: 'r2', name: 'VIP', color: 654321, colorHex: '#654321' }} />)
    expect(screen.getByText('@VIP')).toBeInTheDocument()
  })

  it('falls back to the default indigo color when the role color is 0', () => {
    render(() => <DiscordRole role={{ id: 'r3', name: 'Default', color: 0, colorHex: '#000000' }} />)
    const el = screen.getByText('@Default')
    expect(el).toHaveStyle({ color: '#7d95ff' })
  })
})
