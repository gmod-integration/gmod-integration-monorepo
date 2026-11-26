import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import type { TypeDiscordRole } from '../../../src/utils/types/DiscordTypes.js'

vi.mock('../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/utils/api.js')>()
  return {
    ...actual,
    fetchAPI: vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })),
  }
})

const { guildRoles, guildRolesMutate, guildRolesRefetch } =
  await import('../../../src/pages/dashboard/guilds/GuildInformations.js')
const { fetchAPI } = await import('../../../src/utils/api.js')
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

  it('resolves the role and retains its original color as an accent instead of forcing the text color', () => {
    render(() => <DiscordRole roleID="r1" />)
    const el = screen.getByText('@Moderator')
    expect(el).toHaveClass('discord-role-mention')
    expect(el.style.getPropertyValue('--discord-role-color')).toBe('#1e2a3f')
    expect(el.style.color).toBe('')
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
    const source = { id: 'r3', name: 'Default', color: 0, colorHex: '#000000' }
    render(() => <DiscordRole role={source} />)
    const el = screen.getByText('@Default')
    expect(el.style.getPropertyValue('--discord-role-color')).toBe('#7d95ff')
    expect(source.colorHex).toBe('#000000')
  })

  it('updates when the requested role or the guild role data changes', () => {
    const [roleID, setRoleID] = createSignal('does-not-exist')
    render(() => <DiscordRole roleID={roleID()} />)
    expect(screen.queryByText('@Moderator')).not.toBeInTheDocument()
    setRoleID('r1')
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    guildRolesMutate([{ id: 'r1', name: 'Renamed', color: 1, colorHex: '#123456' }])
    expect(screen.queryByText('@Moderator')).not.toBeInTheDocument()
    expect(screen.getByText('@Renamed').style.getPropertyValue('--discord-role-color')).toBe('#123456')
    setRoleID('missing')
    expect(screen.queryByText('@Renamed')).not.toBeInTheDocument()
  })

  it('hides unresolved roles during loading or errors and recovers after a successful refresh', async () => {
    render(() => <DiscordRole roleID="r1" />)
    expect(screen.getByText('@Moderator')).toBeInTheDocument()
    let rejectLoad!: (error: Error) => void
    vi.mocked(fetchAPI).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectLoad = reject
        }),
    )
    const request = guildRolesRefetch()
    expect(guildRoles.loading).toBe(true)
    expect(screen.queryByText('@Moderator')).not.toBeInTheDocument()
    rejectLoad(new Error('Roles unavailable'))
    await request
    expect(guildRoles.error).toBeTruthy()
    expect(screen.queryByText('@Moderator')).not.toBeInTheDocument()
    vi.mocked(fetchAPI).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'r1', name: 'Recovered', color: 1, colorHex: '#abcdef' }],
    } as Response)
    await guildRolesRefetch()
    expect(screen.getByText('@Recovered')).toBeInTheDocument()
  })

  it('renders and updates an explicit role even when the shared lookup has failed', async () => {
    vi.mocked(fetchAPI).mockRejectedValueOnce(new Error('Roles unavailable'))
    await guildRolesRefetch()
    expect(guildRoles.error).toBeTruthy()
    const [role, setRole] = createSignal<TypeDiscordRole>({ id: 'r2', name: 'VIP', color: 1, colorHex: '#123456' })
    render(() => <DiscordRole role={role()} roleID="r1" />)
    expect(screen.getByText('@VIP')).toBeInTheDocument()
    setRole({ id: 'r3', name: 'Admin', color: 0, colorHex: '#000000' })
    expect(screen.getByText('@Admin').style.getPropertyValue('--discord-role-color')).toBe('#7d95ff')
    expect(screen.queryByText('@VIP')).not.toBeInTheDocument()
    guildRolesMutate([])
  })
})
