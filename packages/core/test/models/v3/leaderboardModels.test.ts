import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/utils/discordFormat.js', () => ({
  dateToDiscordTimestamp: vi.fn((date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:R>`),
  secToTime: vi.fn((sec: number) => `${sec}s`),
}))

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('../../../src/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

vi.mock('@gmod/config', () => ({ ConfigDiscord: { embedColor: '#ffffff' } }))

const prismaMock: any = {
  gm_server_customValues: { findMany: vi.fn() },
  gm_server_stat: { count: vi.fn(), findMany: vi.fn() },
  gm_server_leaderboard_options: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const {
  getServerLeaderboardCategories,
  getLeaderboardButtons,
  getServerLeaderboard,
  getCatFormat,
  saveLeaderboardOptions,
  getLeaderboardMessageEmbed,
  handleLeaderboardInteraction,
} = await import('../../../src/models/v3/leaderboardModels.js')

function resetAllMocks() {
  getTranslateMock.mockClear()
  getServerFromIDMock.mockReset()
  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table as Record<string, any>)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}

describe('leaderboardModels', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe('getServerLeaderboardCategories', () => {
    it('appends enabled custom-value categories to the defaults', async () => {
      prismaMock.gm_server_customValues.findMany.mockResolvedValueOnce([{ valueName: 'money' }])
      const result = await getServerLeaderboardCategories('s1')
      expect(result).toContain('total_time')
      expect(result).toContain('money')
    })

    it('returns just the defaults when there are no custom categories', async () => {
      prismaMock.gm_server_customValues.findMany.mockResolvedValueOnce([])
      const result = await getServerLeaderboardCategories('s1')
      expect(result).toEqual(['total_time', 'total_kill', 'total_death', 'total_connect', 'last_connect', 'first_join'])
    })
  })

  describe('getLeaderboardButtons', () => {
    it('builds an action row with 5 buttons, applying the disabled flags', () => {
      const row = getLeaderboardButtons(true, false)
      const json = row.toJSON() as any
      expect(json.components).toHaveLength(5)
      expect(json.components[0].disabled).toBe(true)
      expect(json.components[3].disabled).toBe(false)
    })
  })

  describe('getServerLeaderboard', () => {
    it('queries with defaults and returns rows/query/total', async () => {
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(42)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ id: 1 }])

      const result = await getServerLeaderboard('s1', 'total_kill')

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { total_kill: 'desc' }, take: 10, skip: 0 }),
      )
      expect(result).toEqual({ rows: [{ id: 1 }], query: { limit: 10, offset: 0, order: 'DESC' }, total: 42 })
    })

    it('orders ascending when order is "ASC"', async () => {
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      await getServerLeaderboard('s1', 'total_kill', 5, 10, 'ASC')
      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { total_kill: 'asc' }, take: 5, skip: 10 }),
      )
    })

    it('falls back to take:10/skip:0 when limit/offset are falsy', async () => {
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      await getServerLeaderboard('s1', 'total_kill', 0, 0)
      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 0 }),
      )
    })
  })

  describe('getCatFormat', () => {
    it('formats total_time via secToTime', async () => {
      expect(await getCatFormat('total_time', 90, 'en')).toBe('90s')
    })

    it('formats total_kill/total_death/total_connect with a translated suffix', async () => {
      expect(await getCatFormat('total_kill', 5, 'en')).toBe('5 kill')
      expect(await getCatFormat('total_death', 3, 'en')).toBe('3 death')
      expect(await getCatFormat('total_connect', 2, 'en')).toBe('2 connect')
    })

    it('formats last_connect/first_join as Discord timestamps', async () => {
      const date = new Date('2026-01-01T00:00:00.000Z')
      expect(await getCatFormat('last_connect', date, 'en')).toContain('<t:')
      expect(await getCatFormat('first_join', date, 'en')).toContain('<t:')
    })

    it('formats money via toLocaleString', async () => {
      const result = await getCatFormat('money', 1000, 'en')
      expect(typeof result).toBe('string')
    })

    it('returns the raw value for an unrecognized category', async () => {
      expect(await getCatFormat('custom_field', 'raw-value', 'en')).toBe('raw-value')
    })
  })

  describe('saveLeaderboardOptions', () => {
    const options = {
      serverID: 's1',
      category: 'total_kill',
      limit: 10,
      offset: 0,
      order: 'DESC',
      page: 1,
      totalPages: 3,
      total: 25,
    }

    it('updates the existing row when one exists', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({ id: 1 })
      await saveLeaderboardOptions('m1', options)
      expect(prismaMock.gm_server_leaderboard_options.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { messageID_serverID: { serverID: 's1', messageID: 'm1' } } }),
      )
    })

    it('creates a new row when none exists', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce(null)
      await saveLeaderboardOptions('m1', options)
      expect(prismaMock.gm_server_leaderboard_options.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ serverID: 's1', messageID: 'm1' }) }),
      )
    })
  })

  describe('getLeaderboardMessageEmbed', () => {
    it('throws when the server is not found', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      await expect(getLeaderboardMessageEmbed('s1', 'total_kill', 'en')).rejects.toThrow('Server not found')
    })

    it('builds the embed with top-3 medal ranks when offset is 0', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'My Server', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(5)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([
        { name: 'P1', total_kill: 10 },
        { name: 'P2', total_kill: 8 },
        { name: 'P3', total_kill: 6 },
        { name: 'P4', total_kill: 4 },
      ])

      const result = await getLeaderboardMessageEmbed('s1', 'total_kill', 'en', 15, 0)

      expect(result).toBeDefined()
      const embedJson = result!.embed.toJSON()
      expect(embedJson.fields).toHaveLength(4)
      expect(embedJson.fields![0].name).toContain('🥇')
      expect(embedJson.fields![3].name).not.toContain('🥇')
      expect(result!.options).toEqual(
        expect.objectContaining({ serverID: 's1', category: 'total_kill', total: 5 }),
      )
    })

    it('does not award medal ranks when offset is not 0', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'My Server', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(5)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ name: 'P1', total_kill: 10 }])

      const result = await getLeaderboardMessageEmbed('s1', 'total_kill', 'en', 15, 5)

      const embedJson = result!.embed.toJSON()
      expect(embedJson.fields![0].name).not.toContain('🥇')
    })

    it('falls back to custom_values when the category is not a direct field', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'My Server', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(1)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([
        { name: 'P1', custom_values: { money: 500 } },
      ])

      const result = await getLeaderboardMessageEmbed('s1', 'money', 'en')

      expect(result!.embed.toJSON().fields).toHaveLength(1)
    })

    it('falls back to the "total_time" literal when neither the direct field nor custom_values has the category', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'My Server', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(1)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ name: 'P1' }])

      const result = await getLeaderboardMessageEmbed('s1', 'unknown_category', 'en')

      // stat['unknown_category'] and stat.custom_values are both absent, so the value passed to
      // getCatFormat falls all the way to the literal string 'total_time' - and since the
      // category itself is 'unknown_category' (not 'total_time'), getCatFormat's default case
      // returns that literal string unchanged.
      expect(result!.embed.toJSON().fields![0].value).toContain('total_time')
    })

    it('skips a row whose formatted value is only whitespace after trimming', async () => {
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'My Server', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(1)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([{ name: 'P1', unknown_category: ' ' }])

      const result = await getLeaderboardMessageEmbed('s1', 'unknown_category', 'en')

      expect(result!.embed.toJSON().fields ?? []).toHaveLength(0)
    })

  })

  describe('handleLeaderboardInteraction', () => {
    function makeInteraction(overrides: Record<string, any> = {}) {
      return {
        isButton: () => true,
        user: { bot: false },
        guild: { preferredLocale: 'en' },
        customId: 'leaderboard_next',
        message: { id: 'm1' },
        reply: vi.fn().mockResolvedValue(undefined),
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        channel: null,
        ...overrides,
      } as any
    }

    it('does nothing when the interaction is not a button', async () => {
      const interaction = makeInteraction({ isButton: () => false })
      await handleLeaderboardInteraction(interaction)
      expect(prismaMock.gm_server_leaderboard_options.findFirst).not.toHaveBeenCalled()
    })

    it('does nothing for bot users', async () => {
      const interaction = makeInteraction({ user: { bot: true } })
      await handleLeaderboardInteraction(interaction)
      expect(prismaMock.gm_server_leaderboard_options.findFirst).not.toHaveBeenCalled()
    })

    it('does nothing when there is no guild', async () => {
      const interaction = makeInteraction({ guild: null })
      await handleLeaderboardInteraction(interaction)
      expect(prismaMock.gm_server_leaderboard_options.findFirst).not.toHaveBeenCalled()
    })

    it('does nothing for an unrelated customId', async () => {
      const interaction = makeInteraction({ customId: 'other' })
      await handleLeaderboardInteraction(interaction)
      expect(prismaMock.gm_server_leaderboard_options.findFirst).not.toHaveBeenCalled()
    })

    it('replies with an error when there are no saved options for this message', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce(null)
      const interaction = makeInteraction()
      await handleLeaderboardInteraction(interaction)
      expect(interaction.reply).toHaveBeenCalledWith({ content: 'error' })
    })

    it('moves the offset back and clamps to 0 for leaderboard_previous', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 5,
        limitValue: 10,
        messageID: 'm1',
        total: 20,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(20)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_previous' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }))
    })

    it('moves the offset back without clamping when the result stays non-negative', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 20,
        limitValue: 10,
        messageID: 'm1',
        total: 20,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(20)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_previous' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10 }))
    })

    it('moves the offset forward for leaderboard_next', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 0,
        limitValue: 10,
        messageID: 'm1',
        total: 20,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(20)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_next' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10 }))
    })

    it('resets the offset to 0 for leaderboard_first', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 30,
        limitValue: 10,
        messageID: 'm1',
        total: 20,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(20)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_first' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }))
    })

    it('jumps to the last page for leaderboard_last', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 0,
        limitValue: 10,
        messageID: 'm1',
        total: 25,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(25)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_last' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 15 }))
    })

    it('leaves the offset unchanged for a recognized leaderboard_ button with no matching case (e.g. refresh)', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 7,
        limitValue: 10,
        messageID: 'm1',
        total: 25,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(25)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_refresh' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 7 }))
    })

    it('clamps leaderboard_last to 0 when total is smaller than the limit', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 0,
        limitValue: 10,
        messageID: 'm1',
        total: 5,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(5)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_last' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }))
    })

    it('falls back to offset 0 for leaderboard_last when options.total is falsy', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 0,
        limitValue: 10,
        messageID: 'm1',
        total: 0,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(0)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ customId: 'leaderboard_last' })
      await handleLeaderboardInteraction(interaction)

      expect(prismaMock.gm_server_stat.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }))
    })

    it('does nothing further when the interaction has no channel', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 0,
        limitValue: 10,
        messageID: 'm1',
        total: 20,
        serverID: 's1',
        category: 'total_kill',
      })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(20)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])

      const interaction = makeInteraction({ channel: null })
      await handleLeaderboardInteraction(interaction)

      expect(interaction.deferUpdate).not.toHaveBeenCalled()
    })

    it('edits the message, saves the options, and defers the update when a channel is present', async () => {
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({
        offsetValue: 0,
        limitValue: 10,
        messageID: 'm1',
        total: 20,
        serverID: 's1',
        category: 'total_kill',
      })
      prismaMock.gm_server_leaderboard_options.findFirst.mockResolvedValueOnce({ id: 1 })
      getServerFromIDMock.mockResolvedValueOnce({ getName: () => 'S', getID: () => 's1' })
      prismaMock.gm_server_stat.count.mockResolvedValueOnce(20)
      prismaMock.gm_server_stat.findMany.mockResolvedValueOnce([])
      prismaMock.gm_server_leaderboard_options.update.mockResolvedValueOnce({})

      const editMock = vi.fn().mockResolvedValueOnce(undefined)
      const fetchMock = vi.fn().mockResolvedValueOnce({ edit: editMock })
      const interaction = makeInteraction({ channel: { messages: { fetch: fetchMock } } })

      await handleLeaderboardInteraction(interaction)
      await vi.waitFor(() => expect(interaction.deferUpdate).toHaveBeenCalled())

      expect(fetchMock).toHaveBeenCalledWith('m1')
      expect(editMock).toHaveBeenCalled()
    })
  })
})
