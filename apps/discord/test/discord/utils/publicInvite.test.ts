import { describe, expect, it, vi } from 'vitest'
import { ChannelType, Collection, PermissionFlagsBits } from 'discord.js'
import { getPublicGuildInvite } from '../../../src/discord/utils/publicInvite.js'

function fixture() {
  const member = { id: 'bot' }
  const everyone = { id: 'everyone' }
  const channel = {
    id: 'public',
    type: ChannelType.GuildText,
    position: 1,
    permissionsFor: vi.fn((subject) => ({ has: vi.fn(() => subject === member || subject === everyone) })),
    createInvite: vi.fn().mockResolvedValue({ code: 'created-Code' }),
  }
  const guild = {
    vanityURLCode: null,
    client: { user: { id: 'bot' } },
    invites: { fetch: vi.fn().mockResolvedValue(new Collection()) },
    channels: { fetch: vi.fn().mockResolvedValue(undefined), cache: new Collection([['public', channel]]) },
    members: { me: member, fetchMe: vi.fn().mockResolvedValue(member) },
    roles: { everyone },
    systemChannel: null,
  }
  return { guild, channel, member, everyone }
}

describe('getPublicGuildInvite', () => {
  it('uses the community vanity URL without fetching or creating invitations', async () => {
    const { guild, channel } = fixture()
    guild.vanityURLCode = 'vanity-Code' as any
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/vanity-Code')
    expect(guild.invites.fetch).not.toHaveBeenCalled()
    expect(channel.createInvite).not.toHaveBeenCalled()
  })

  it('prefers a permanent unlimited invitation created by the active bot', async () => {
    const { guild, channel } = fixture()
    guild.invites.fetch.mockResolvedValueOnce(
      new Collection([
        [
          'other',
          { code: 'other', channelId: 'public', maxAge: 0, maxUses: 0, temporary: false, inviter: { id: 'other' } },
        ],
        [
          'ours',
          { code: 'ours', channelId: 'public', maxAge: 0, maxUses: 0, temporary: false, inviter: { id: 'bot' } },
        ],
      ]),
    )
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/ours')
    expect(channel.createInvite).not.toHaveBeenCalled()
  })

  it('reuses an existing valid permanent invitation when the bot does not own one', async () => {
    const { guild } = fixture()
    guild.invites.fetch.mockResolvedValueOnce(
      new Collection([
        ['invalid', { code: 'bad/code', maxAge: 0, maxUses: 0, temporary: false }],
        ['short', { code: 'short', maxAge: 600, maxUses: 0, temporary: false }],
        ['limited', { code: 'limited', maxAge: 0, maxUses: 2, temporary: false }],
        ['temporary', { code: 'temporary', maxAge: 0, maxUses: 0, temporary: true }],
        [
          'expired',
          {
            code: 'expired',
            channelId: 'public',
            maxAge: 0,
            maxUses: 0,
            temporary: false,
            expiresTimestamp: Date.now() - 1,
          },
        ],
        [
          'future',
          {
            code: 'future',
            channelId: 'gone',
            maxAge: 0,
            maxUses: 0,
            temporary: false,
            expiresTimestamp: Date.now() + 10000,
          },
        ],
        ['unknown', { code: 'unknown', maxAge: 0, maxUses: 0, temporary: false }],
        ['valid', { code: 'valid', channel: { id: 'public' }, maxAge: 0, maxUses: 0, temporary: false }],
      ]),
    )
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/valid')
  })

  it('creates a reusable invite in the public system channel after a restricted invite listing', async () => {
    const { guild, channel, member } = fixture()
    guild.vanityURLCode = 'bad/code' as any
    guild.invites.fetch.mockRejectedValueOnce(new Error('Missing ManageGuild permission'))
    guild.members.me = null as any
    guild.systemChannel = channel as any
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/created-Code')
    expect(guild.members.fetchMe).toHaveBeenCalled()
    expect(channel.permissionsFor).toHaveBeenCalledWith(member)
    expect(channel.permissionsFor.mock.results[0].value.has).toHaveBeenCalledWith([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.CreateInstantInvite,
    ])
    expect(channel.createInvite).toHaveBeenCalledWith({
      maxAge: 0,
      maxUses: 0,
      temporary: false,
      unique: false,
      reason: 'Public server directory invitation',
    })
  })

  it('selects the first accessible public text channel and skips hidden or non-text channels', async () => {
    const { guild, channel, member } = fixture()
    const hidden = {
      ...channel,
      id: 'hidden',
      position: 0,
      permissionsFor: vi.fn((subject) => ({ has: () => subject === member })),
      createInvite: vi.fn(),
    }
    const voice = { ...channel, id: 'voice', type: ChannelType.GuildVoice, createInvite: vi.fn() }
    const later = { ...channel, id: 'later', position: 9, createInvite: vi.fn() }
    guild.channels.cache = new Collection([
      ['later', later],
      ['voice', voice],
      ['hidden', hidden],
      ['public', channel],
    ]) as any
    guild.systemChannel = hidden as any
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/created-Code')
    expect(hidden.createInvite).not.toHaveBeenCalled()
    expect(voice.createInvite).not.toHaveBeenCalled()
    expect(later.createInvite).not.toHaveBeenCalled()
    expect(channel.permissionsFor).toHaveReturnedWith(expect.objectContaining({ has: expect.any(Function) }))
  })

  it('returns no link when no public channel grants the invitation permission', async () => {
    const { guild, channel } = fixture()
    channel.permissionsFor.mockReturnValueOnce({ has: vi.fn(() => false) })
    expect(await getPublicGuildInvite(guild as any)).toBeNull()
    expect(channel.createInvite).not.toHaveBeenCalled()
    const absent = fixture()
    absent.channel.permissionsFor.mockReturnValue(null as any)
    expect(await getPublicGuildInvite(absent.guild as any)).toBeNull()
  })

  it('does not return a malformed invitation code supplied by Discord', async () => {
    const { guild, channel } = fixture()
    channel.createInvite.mockResolvedValueOnce({ code: 'bad/code' })
    expect(await getPublicGuildInvite(guild as any)).toBeNull()
    expect(channel.permissionsFor).toHaveBeenCalled()
  })

  it('does not expose permanent invitations into private or unknown channels', async () => {
    const { guild, channel, member } = fixture()
    const hidden = { ...channel, id: 'staff', permissionsFor: vi.fn((subject) => ({ has: () => subject === member })) }
    guild.channels.cache.set('staff', hidden as any)
    guild.invites.fetch.mockResolvedValueOnce(
      new Collection([
        [
          'staff',
          { code: 'staff-code', channelId: 'staff', maxAge: 0, maxUses: 0, temporary: false, inviter: { id: 'bot' } },
        ],
        ['unknown', { code: 'unknown-code', channelId: 'missing', maxAge: 0, maxUses: 0, temporary: false }],
      ]),
    )
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/created-Code')
    expect(channel.createInvite).toHaveBeenCalledTimes(1)
  })

  it('can reuse a public invitation without requiring permission to create another', async () => {
    const { guild, channel, everyone } = fixture()
    channel.permissionsFor.mockImplementation((subject) => ({ has: vi.fn(() => subject === everyone) }))
    guild.invites.fetch.mockResolvedValueOnce(
      new Collection([
        ['public', { code: 'public-code', channelId: 'public', maxAge: 0, maxUses: 0, temporary: false }],
      ]),
    )
    expect(await getPublicGuildInvite(guild as any)).toBe('https://discord.gg/public-code')
    expect(channel.createInvite).not.toHaveBeenCalled()
    expect(guild.members.fetchMe).not.toHaveBeenCalled()
  })
})
