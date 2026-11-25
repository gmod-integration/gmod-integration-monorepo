import { beforeEach, describe, expect, it, vi } from 'vitest'

const countMock = vi.fn()
const findManyMock = vi.fn()
const optionsFindFirstMock = vi.fn()
const optionsUpdateMock = vi.fn()
const optionsCreateMock = vi.fn()

vi.mock('@gmod/infra-prisma', () => ({
  default: {
    gm_server_warn: { count: countMock, findMany: findManyMock },
    gm_server_warn_options: {
      findFirst: optionsFindFirstMock,
      update: optionsUpdateMock,
      create: optionsCreateMock,
    },
  },
}))

vi.mock('@gmod/config', () => ({ ConfigDiscord: { embedColor: 0x393a41 } }))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getUserFromDiscordIDMock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: getUserFromDiscordIDMock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const { getServerUserWarn, saveWarnListOptions, getWarnMessageEmbed, handleWarnInteraction, canViewWarningHistory } =
  await import('../src/warnModels.js')

function fakeServer() {
  return { getName: () => 'My Server', getID: () => 's1', getGuildID: () => 'g1' }
}

describe('getServerUserWarn', () => {
  beforeEach(() => {
    countMock.mockReset()
    findManyMock.mockReset()
  })

  it('returns rows/query/total with the given params, sorting DESC by default', async () => {
    countMock.mockResolvedValueOnce(2)
    findManyMock.mockResolvedValueOnce([{ id: 1 }])

    const result = await getServerUserWarn('s1', '765')

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 5, skip: 0 }),
    )
    expect(result).toEqual({ rows: [{ id: 1 }], query: { limit: 5, offset: 0, order: 'DESC' }, total: 2 })
  })

  it('sorts ASC when order is "ASC"', async () => {
    countMock.mockResolvedValueOnce(0)
    findManyMock.mockResolvedValueOnce([])

    await getServerUserWarn('s1', '765', 10, 0, 'ASC')

    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'asc' } }))
  })
})

describe('saveWarnListOptions', () => {
  beforeEach(() => {
    optionsFindFirstMock.mockReset()
    optionsUpdateMock.mockReset()
    optionsCreateMock.mockReset()
  })

  it('updates existing options when found', async () => {
    optionsFindFirstMock.mockResolvedValueOnce({ msgID: 'm1' })

    await saveWarnListOptions('m1', 's1', '765', { total: 3, limit: 10, offset: 5, order: 'ASC' })

    expect(optionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 3, limit: 10, offset: 5, order: 'ASC' }) }),
    )
    expect(optionsCreateMock).not.toHaveBeenCalled()
  })

  it('creates options with defaults when none exist and options are omitted', async () => {
    optionsFindFirstMock.mockResolvedValueOnce(null)

    await saveWarnListOptions('m1', 's1', '765', {})

    expect(optionsCreateMock).toHaveBeenCalledWith({
      data: { msgID: 'm1', serverID: 's1', steamID64: '765', total: 0, limit: 5, offset: 0, order: 'DESC' },
    })
  })

  it('creates options using the given values when provided', async () => {
    optionsFindFirstMock.mockResolvedValueOnce(null)

    await saveWarnListOptions('m1', 's1', '765', { total: 7, limit: 20, offset: 2, order: 'ASC' })

    expect(optionsCreateMock).toHaveBeenCalledWith({
      data: { msgID: 'm1', serverID: 's1', steamID64: '765', total: 7, limit: 20, offset: 2, order: 'ASC' },
    })
  })
})

describe('getWarnMessageEmbed', () => {
  beforeEach(() => {
    countMock.mockReset()
    findManyMock.mockReset()
    getTranslateMock.mockClear()
  })

  it('builds the embed and buttons for a page in the middle of the list', async () => {
    countMock.mockResolvedValueOnce(12)
    findManyMock.mockResolvedValueOnce([{ createdAt: new Date('2024-01-01'), reason: 'spam' }])

    const { embed, component, options } = await getWarnMessageEmbed(fakeServer() as any, '765', 'en', 5, 5, 'DESC')

    expect(options).toEqual({ total: 12, limit: 5, offset: 5, order: 'DESC' })
    expect(embed.data.title).toBe('warn_for_user')
    expect(component.components).toHaveLength(3)
    // page 2 of 3 -> neither prev nor next disabled
    expect(component.components[0].data.disabled).toBe(false)
    expect(component.components[2].data.disabled).toBe(false)
  })

  it('disables "previous" on the first page and falls back to no_reason for missing reasons', async () => {
    countMock.mockResolvedValueOnce(3)
    findManyMock.mockResolvedValueOnce([{ createdAt: new Date('2024-01-01'), reason: null }])

    const { component } = await getWarnMessageEmbed(fakeServer() as any, '765', 'en', 5, 0, 'DESC')

    expect(component.components[0].data.disabled).toBe(true)
    expect(getTranslateMock).toHaveBeenCalledWith('no_reason', 'en')
  })

  it('disables "next" on the last page and clamps actualPage/totalPages when there are 0 warns', async () => {
    countMock.mockResolvedValueOnce(0)
    findManyMock.mockResolvedValueOnce([])

    const { component, embed } = await getWarnMessageEmbed(fakeServer() as any, '765', 'en', 5, 0, 'DESC')

    expect(component.components[2].data.disabled).toBe(true)
    expect(embed.data.description).toContain('1 / 1')
  })

  it('clamps actualPage to 1 when the stored offset is negative', async () => {
    countMock.mockResolvedValueOnce(5)
    findManyMock.mockResolvedValueOnce([])

    const { embed } = await getWarnMessageEmbed(fakeServer() as any, '765', 'en', 5, -10, 'DESC')

    expect(embed.data.description).toMatch(/\*\*1 \//)
  })
})

describe('handleWarnInteraction', () => {
  it('rejects a saved warning message belonging to another community', async () => {
    optionsFindFirstMock.mockResolvedValueOnce({ serverID: 'foreign', steamID64: '765' })
    getServerFromIDMock.mockResolvedValueOnce({ getGuildID: () => 'other' })
    const interaction = fakeInteraction()
    await handleWarnInteraction(interaction as any)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
    expect(countMock).not.toHaveBeenCalled()
    expect(interaction.update).not.toHaveBeenCalled()
  })

  it('rejects a now unauthorized viewer before reading another page', async () => {
    optionsFindFirstMock.mockResolvedValueOnce({ serverID: 's1', steamID64: '765' })
    getServerFromIDMock.mockResolvedValueOnce(fakeServer())
    getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => 'other' })
    const interaction = fakeInteraction({ memberPermissions: { has: () => false } })
    await handleWarnInteraction(interaction as any)
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'missing_permission', ephemeral: true })
    expect(countMock).not.toHaveBeenCalled()
    expect(interaction.update).not.toHaveBeenCalled()
  })

  it('moves legacy public pagination into a private reply without editing the public message', async () => {
    optionsFindFirstMock.mockResolvedValueOnce({ serverID: 's1', steamID64: '765', limit: 5, offset: 0, order: 'DESC' })
    getServerFromIDMock.mockResolvedValueOnce(fakeServer())
    countMock.mockResolvedValueOnce(10)
    findManyMock.mockResolvedValueOnce([])
    optionsFindFirstMock.mockResolvedValueOnce(null)
    const interaction = fakeInteraction({ message: { id: 'legacy', flags: { has: () => false } } })
    interaction.reply.mockResolvedValueOnce({ id: 'private' })
    await handleWarnInteraction(interaction as any)
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true, fetchReply: true }))
    expect(optionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ msgID: 'private' }) }),
    )
    expect(interaction.update).not.toHaveBeenCalled()
    expect(interaction.channel.messages.fetch).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    countMock.mockReset()
    findManyMock.mockReset()
    optionsFindFirstMock.mockReset()
    optionsUpdateMock.mockReset()
    optionsCreateMock.mockReset()
    getServerFromIDMock.mockReset()
  })

  function fakeInteraction(overrides: Record<string, any> = {}) {
    return {
      isButton: () => true,
      user: { id: 'u1', bot: false },
      memberPermissions: { has: () => true },
      guild: { id: 'g1', ownerId: 'owner', preferredLocale: 'en' },
      channel: { messages: { fetch: vi.fn() } },
      customId: 'warn_next',
      message: { id: 'm1', flags: { has: () => true } },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }

  it('does nothing when the interaction is not a button', async () => {
    const interaction = fakeInteraction({ isButton: () => false })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('does nothing when the interaction is from a bot', async () => {
    const interaction = fakeInteraction({ user: { bot: true } })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('does nothing when there is no guild', async () => {
    const interaction = fakeInteraction({ guild: null })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('does nothing when there is no channel', async () => {
    const interaction = fakeInteraction({ channel: null })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('does nothing when the customId does not start with warn_', async () => {
    const interaction = fakeInteraction({ customId: 'other_button' })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('does nothing when customId is missing', async () => {
    const interaction = fakeInteraction({ customId: undefined })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('replies with an error when no saved options are found for the message', async () => {
    optionsFindFirstMock.mockResolvedValueOnce(null)
    const interaction = fakeInteraction()

    await handleWarnInteraction(interaction as any)

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'error', ephemeral: true })
  })

  it('replies with an error when the server no longer exists', async () => {
    optionsFindFirstMock.mockResolvedValueOnce({ serverID: 's1', offset: 0, limit: 5, order: 'DESC', steamID64: '765' })
    getServerFromIDMock.mockResolvedValueOnce(null)
    const interaction = fakeInteraction()

    await handleWarnInteraction(interaction as any)

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'server_not_found', ephemeral: true })
  })

  async function runInteractionFlow(customId: string, storedOffset: number, limit = 5) {
    optionsFindFirstMock.mockResolvedValueOnce({
      serverID: 's1',
      offset: storedOffset,
      limit,
      order: 'DESC',
      steamID64: '765',
    })
    getServerFromIDMock.mockResolvedValueOnce(fakeServer())
    countMock.mockResolvedValueOnce(20)
    findManyMock.mockResolvedValueOnce([])
    optionsFindFirstMock.mockResolvedValueOnce({ msgID: 'm1' }) // saveWarnListOptions -> update path

    const editMock = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue({ edit: editMock })
    const interaction = fakeInteraction({ customId, channel: { messages: { fetch: fetchMock } } })

    await handleWarnInteraction(interaction as any)
    // handleWarnInteraction kicks off a .then() chain without awaiting it - flush the
    // microtask + macrotask queue so the message edit / save / deferUpdate settle.
    await new Promise((resolve) => setTimeout(resolve, 0))

    return { interaction, editMock, fetchMock }
  }

  it('warn_previous clamps the offset at 0 when it would go negative', async () => {
    const { fetchMock } = await runInteractionFlow('warn_previous', 2, 5)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(optionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ offset: 0 }) }),
    )
  })

  it('warn_previous does not clamp when the resulting offset is still non-negative', async () => {
    await runInteractionFlow('warn_previous', 10, 5)
    expect(optionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ offset: 5 }) }),
    )
  })

  it('ignores an unrecognized button action before querying history', async () => {
    const interaction = fakeInteraction({ customId: 'warn_unknown_action' })
    await handleWarnInteraction(interaction as any)
    expect(optionsFindFirstMock).not.toHaveBeenCalled()
  })

  it('warn_next advances the offset', async () => {
    await runInteractionFlow('warn_next', 5, 5)
    expect(optionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ offset: 10 }) }),
    )
  })

  it('warn_refresh resets the offset to 0', async () => {
    await runInteractionFlow('warn_refresh', 15, 5)
    expect(optionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ offset: 0 }) }),
    )
  })

  it('updates the private interaction without fetching or editing a channel message', async () => {
    const { editMock, interaction } = await runInteractionFlow('warn_next', 0, 5)
    expect(editMock).not.toHaveBeenCalled()
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }))
    expect(interaction.deferUpdate).not.toHaveBeenCalled()
  })
})

describe('warning history access', () => {
  beforeEach(() => getUserFromDiscordIDMock.mockReset())
  const viewer = (overrides: any = {}) => ({
    guild: { id: 'g1', ownerId: 'owner' },
    user: { id: 'u1' },
    memberPermissions: { has: () => false },
    ...overrides,
  })
  it('allows an ordinary verified user to view their own warnings', async () => {
    getUserFromDiscordIDMock.mockResolvedValueOnce({ getSteamID64: () => '765' })
    expect(await canViewWarningHistory(viewer() as any, '765')).toBe(true)
  })
  it.each([null, { getSteamID64: () => null }, { getSteamID64: () => 'another' }])(
    'denies unlinked or other-player access (%j)',
    async (user) => {
      getUserFromDiscordIDMock.mockResolvedValueOnce(user)
      expect(await canViewWarningHistory(viewer() as any, '765')).toBe(false)
    },
  )
  it.each([{ user: { id: 'owner' } }, { memberPermissions: { has: () => true } }])(
    'allows the community owner or Discord Administrator without requiring a Steam link (%j)',
    async (overrides) => {
      expect(await canViewWarningHistory(viewer(overrides) as any, '765')).toBe(true)
      expect(getUserFromDiscordIDMock).not.toHaveBeenCalled()
    },
  )
  it('denies a viewer outside a guild', async () => {
    expect(await canViewWarningHistory(viewer({ guild: null }) as any, '765')).toBe(false)
  })
})
