import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queueInstances = new Map<string, { add: ReturnType<typeof vi.fn> }>()

vi.mock('bullmq', () => {
  class QueueMock {
    name: string
    add: ReturnType<typeof vi.fn>
    constructor(name: string) {
      this.name = name
      this.add = vi.fn().mockResolvedValue({ id: 'job-id' })
      queueInstances.set(name, this as any)
    }
  }
  return { Queue: QueueMock }
})

const redisGetMock = vi.fn()
const redisDelMock = vi.fn().mockResolvedValue(1)
vi.mock('@gmod/infra-redis', () => ({ default: { get: redisGetMock, del: redisDelMock } }))

const adapters = await import('../src/discordQueueAdapters.js')

function mockReply(payload: Record<string, unknown>) {
  redisGetMock.mockResolvedValueOnce(JSON.stringify(payload))
}

describe('packages/infra-bullmq src/discordQueueAdapters.ts', () => {
  beforeEach(() => {
    redisGetMock.mockReset()
    redisDelMock.mockClear()
    for (const queue of queueInstances.values()) {
      queue.add.mockClear()
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('fire-and-forget job enqueuers', () => {
    it('enqueueUpdateGuildUserPseudo adds a job to the pseudo queue', async () => {
      await adapters.enqueueUpdateGuildUserPseudo({
        serverID: 's1',
        steamID64: '76561198219049673',
        playerName: 'Bob',
        userGroup: 'user',
      })

      expect(queueInstances.get('discord-updatePseudo')!.add).toHaveBeenCalledWith(
        'updatePseudo',
        expect.objectContaining({ serverID: 's1' }),
        expect.objectContaining({ priority: 5 }),
      )
    })

    it('enqueueUpdateGuildUserPseudo logs and rethrows when the queue rejects', async () => {
      const boom = new Error('redis unreachable')
      queueInstances.get('discord-updatePseudo')!.add.mockRejectedValueOnce(boom)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        adapters.enqueueUpdateGuildUserPseudo({
          serverID: 's1',
          steamID64: '76561198219049673',
          playerName: 'Bob',
          userGroup: 'user',
        }),
      ).rejects.toBe(boom)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to queue updatePseudo'))
    })

    it('enqueueUpdatePlayerUserGroup adds a job to the group queue', async () => {
      await adapters.enqueueUpdatePlayerUserGroup({
        serverID: 's1',
        steamID64: '76561198219049673',
        userGroup: 'admin',
      })
      expect(queueInstances.get('discord-updateGroup')!.add).toHaveBeenCalledWith(
        'updateGroup',
        expect.objectContaining({ userGroup: 'admin' }),
        expect.objectContaining({ priority: 8 }),
      )
    })

    it('enqueueUpdatePlayerUserGroup logs and rethrows when the queue rejects', async () => {
      const boom = new Error('down')
      queueInstances.get('discord-updateGroup')!.add.mockRejectedValueOnce(boom)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(
        adapters.enqueueUpdatePlayerUserGroup({ serverID: 's1', steamID64: '1', userGroup: 'admin' }),
      ).rejects.toBe(boom)
    })

    it('enqueueUpdateDiscordTeamRole adds a job to the team role queue', async () => {
      await adapters.enqueueUpdateDiscordTeamRole({
        serverID: 's1',
        steamID64: '76561198219049673',
        teamName: 'Police',
      })
      expect(queueInstances.get('discord-updateTeamRole')!.add).toHaveBeenCalledWith(
        'updateTeamRole',
        expect.objectContaining({ teamName: 'Police' }),
        expect.objectContaining({ priority: 8 }),
      )
    })

    it('enqueueUpdateDiscordTeamRole logs and rethrows when the queue rejects', async () => {
      const boom = new Error('down')
      queueInstances.get('discord-updateTeamRole')!.add.mockRejectedValueOnce(boom)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(adapters.enqueueUpdateDiscordTeamRole({ serverID: 's1', steamID64: '1' })).rejects.toBe(boom)
    })
  })

  // Every request/reply adapter shares the same enqueue -> waitForReply(poll Redis) -> parse
  // shape. Table-driven: each entry supplies a valid reply payload and the expected return
  // value, exercising every enqueueX function's own wiring (queue name, job name, reply
  // parsing) without duplicating ~27 near-identical test blocks by hand.
  const requestReplyCases: Array<{
    name: string
    call: () => Promise<unknown>
    reply: Record<string, unknown>
    expected: unknown
  }> = [
    {
      name: 'enqueueMainClientHasGuild',
      call: () => adapters.enqueueMainClientHasGuild('g1'),
      reply: { correlationId: 'x', hasGuild: true },
      expected: true,
    },
    {
      name: 'enqueueMainClientUploadScreenshot',
      call: () =>
        adapters.enqueueMainClientUploadScreenshot({
          channelID: 'ch1',
          content: 'hi',
          minioKey: 'k1',
          fileName: 'f.png',
          contentType: 'image/png',
        }),
      reply: { correlationId: 'x', discordUrl: 'https://cdn.discordapp.com/x.png' },
      expected: 'https://cdn.discordapp.com/x.png',
    },
    {
      name: 'enqueueMainClientFetchUser (found)',
      call: () => adapters.enqueueMainClientFetchUser('d1'),
      reply: { correlationId: 'x', user: { id: 'd1', username: 'bob', displayName: 'Bob', avatarURL: null } },
      expected: { id: 'd1', username: 'bob', displayName: 'Bob', avatarURL: null },
    },
    {
      name: 'enqueueMainClientFetchUser (not found)',
      call: () => adapters.enqueueMainClientFetchUser('d1'),
      reply: { correlationId: 'x', user: null },
      expected: null,
    },
    {
      name: 'enqueueMainClientSyncPremiumRoles',
      call: () => adapters.enqueueMainClientSyncPremiumRoles(),
      reply: { correlationId: 'x', synced: true },
      expected: true,
    },
    {
      name: 'enqueueMainClientSetPresence',
      call: () => adapters.enqueueMainClientSetPresence('Playing'),
      reply: { correlationId: 'x', updated: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordGuildVerifyUser',
      call: () => adapters.enqueueDiscordGuildVerifyUser('g1', 'u1'),
      reply: { correlationId: 'x', verified: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordGuildRunVerificationCheck',
      call: () => adapters.enqueueDiscordGuildRunVerificationCheck('g1'),
      reply: { correlationId: 'x', processed: 4 },
      expected: 4,
    },
    {
      name: 'enqueueDiscordCreateVerificationMessage',
      call: () => adapters.enqueueDiscordCreateVerificationMessage('g1', 'ch1'),
      reply: { correlationId: 'x', verifyMessage: { guildID: 'g1', channelID: 'ch1', messageID: 'm1' } },
      expected: { guildID: 'g1', channelID: 'ch1', messageID: 'm1' },
    },
    {
      name: 'enqueueDiscordDeleteVerificationMessage',
      call: () => adapters.enqueueDiscordDeleteVerificationMessage('g1', 'ch1', 'm1'),
      reply: { correlationId: 'x', deleted: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordGuildBotClientInfo',
      call: () => adapters.enqueueDiscordGuildBotClientInfo('g1'),
      reply: { correlationId: 'x', botInfo: { id: 'b1', username: 'bot', avatar: null, custom: false, onGuild: true } },
      expected: { id: 'b1', username: 'bot', avatar: null, custom: false, onGuild: true },
    },
    {
      name: 'enqueueDiscordGuildReloadBotInstance',
      call: () => adapters.enqueueDiscordGuildReloadBotInstance('g1'),
      reply: { correlationId: 'x', reloaded: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordGuildSyncBan',
      call: () => adapters.enqueueDiscordGuildSyncBan('g1', ['old1'], 'new1'),
      reply: { correlationId: 'x', synced: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordGuildAdmins',
      call: () => adapters.enqueueDiscordGuildAdmins('g1'),
      reply: { correlationId: 'x', admins: [{ id: 'a1', name: 'Admin', avatar: null }] },
      expected: [{ id: 'a1', name: 'Admin', avatar: null }],
    },
    {
      name: 'enqueueDiscordGuildBans',
      call: () => adapters.enqueueDiscordGuildBans('g1'),
      reply: { correlationId: 'x', bans: [{ id: 'u1', tag: 'User#0001', reason: 'cheating' }] },
      expected: [{ id: 'u1', tag: 'User#0001', reason: 'cheating' }],
    },
    {
      name: 'enqueueDiscordGuildSendLogMessage',
      call: () =>
        adapters.enqueueDiscordGuildSendLogMessage({
          guildID: 'g1',
          channelID: 'ch1',
          title: 't',
          color: '#fff',
          footer: 'f',
        }),
      reply: { correlationId: 'x', sent: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordServerStatusCreate',
      call: () => adapters.enqueueDiscordServerStatusCreate('s1', 'ch1'),
      reply: { correlationId: 'x', status: { server: 's1', channel: 'ch1', message: 'm1' } },
      expected: { server: 's1', channel: 'ch1', message: 'm1' },
    },
    {
      name: 'enqueueDiscordServerStatusDelete',
      call: () => adapters.enqueueDiscordServerStatusDelete('s1'),
      reply: { correlationId: 'x', status: null },
      expected: null,
    },
    {
      name: 'enqueueDiscordServerLogsChannelCreate',
      call: () => adapters.enqueueDiscordServerLogsChannelCreate('s1', 'ch1'),
      reply: {
        correlationId: 'x',
        logsChannel: { serverID: 's1', channelID: 'ch1', webhookID: 'w1', webhookToken: 'wt1' },
      },
      expected: { serverID: 's1', channelID: 'ch1', webhookID: 'w1', webhookToken: 'wt1' },
    },
    {
      name: 'enqueueDiscordServerLogsChannelDelete',
      call: () => adapters.enqueueDiscordServerLogsChannelDelete('s1'),
      reply: { correlationId: 'x', logsChannel: null },
      expected: null,
    },
    {
      name: 'enqueueDiscordServerScreenshotChannelCreate',
      call: () => adapters.enqueueDiscordServerScreenshotChannelCreate('s1', 'ch1'),
      reply: {
        correlationId: 'x',
        screenshotChannel: { server: 's1', adminCmd: false, channelID: 'ch1', webhook: 'wh1', token: 'tok1' },
      },
      expected: { server: 's1', adminCmd: false, channelID: 'ch1', webhook: 'wh1', token: 'tok1' },
    },
    {
      name: 'enqueueDiscordServerScreenshotChannelDelete',
      call: () => adapters.enqueueDiscordServerScreenshotChannelDelete('s1'),
      reply: { correlationId: 'x', screenshotChannel: null },
      expected: null,
    },
    {
      name: 'enqueueDiscordServerVoteChannelCreate',
      call: () => adapters.enqueueDiscordServerVoteChannelCreate('s1', 'ch1'),
      reply: {
        correlationId: 'x',
        voteChannel: { serverID: 's1', channelID: 'ch1', webhookID: 'w1', webhookToken: 'wt1' },
      },
      expected: { serverID: 's1', channelID: 'ch1', webhookID: 'w1', webhookToken: 'wt1' },
    },
    {
      name: 'enqueueDiscordServerVoteChannelDelete',
      call: () => adapters.enqueueDiscordServerVoteChannelDelete('s1'),
      reply: { correlationId: 'x', voteChannel: null },
      expected: null,
    },
    {
      name: 'enqueueDiscordServerSyncChatCreate',
      call: () => adapters.enqueueDiscordServerSyncChatCreate('s1', 'ch1'),
      reply: { correlationId: 'x', syncChat: { guild: 'g1', channel: 'ch1', server: 's1', id: 'id1', token: 'tok1' } },
      expected: { guild: 'g1', channel: 'ch1', server: 's1', id: 'id1', token: 'tok1' },
    },
    {
      name: 'enqueueDiscordServerSyncChatDelete',
      call: () => adapters.enqueueDiscordServerSyncChatDelete('s1'),
      reply: { correlationId: 'x', syncChat: null },
      expected: null,
    },
    {
      name: 'enqueueDiscordGuildRemoveSyncRoles',
      call: () => adapters.enqueueDiscordGuildRemoveSyncRoles('g1', 'd1', ['r1']),
      reply: { correlationId: 'x', processed: true },
      expected: true,
    },
    {
      name: 'enqueueDiscordServerStatusRefresh',
      call: () => adapters.enqueueDiscordServerStatusRefresh('s1'),
      reply: { correlationId: 'x', refreshed: true },
      expected: true,
    },
  ]

  describe('request/reply adapters (happy path)', () => {
    for (const { name, call, reply, expected } of requestReplyCases) {
      it(`${name} resolves with the parsed reply`, async () => {
        mockReply(reply)
        await expect(call()).resolves.toEqual(expected)
        expect(redisDelMock).toHaveBeenCalled()
      })
    }
  })

  describe('adapters that throw when the reply carries an error', () => {
    // Each of these reply schemas requires its data field to be *present* (nullable, not
    // optional) even on an error reply, so the error-case payload must still include it as
    // null - otherwise reply parsing itself fails before the `if (reply.error)` branch is ever
    // reached.
    const errorCases: Array<{ name: string; call: () => Promise<unknown>; nullField: string }> = [
      {
        name: 'enqueueDiscordCreateVerificationMessage',
        call: () => adapters.enqueueDiscordCreateVerificationMessage('g1', 'ch1'),
        nullField: 'verifyMessage',
      },
      {
        name: 'enqueueDiscordServerStatusCreate',
        call: () => adapters.enqueueDiscordServerStatusCreate('s1', 'ch1'),
        nullField: 'status',
      },
      {
        name: 'enqueueDiscordServerStatusDelete',
        call: () => adapters.enqueueDiscordServerStatusDelete('s1'),
        nullField: 'status',
      },
      {
        name: 'enqueueDiscordServerLogsChannelCreate',
        call: () => adapters.enqueueDiscordServerLogsChannelCreate('s1', 'ch1'),
        nullField: 'logsChannel',
      },
      {
        name: 'enqueueDiscordServerLogsChannelDelete',
        call: () => adapters.enqueueDiscordServerLogsChannelDelete('s1'),
        nullField: 'logsChannel',
      },
      {
        name: 'enqueueDiscordServerScreenshotChannelCreate',
        call: () => adapters.enqueueDiscordServerScreenshotChannelCreate('s1', 'ch1'),
        nullField: 'screenshotChannel',
      },
      {
        name: 'enqueueDiscordServerScreenshotChannelDelete',
        call: () => adapters.enqueueDiscordServerScreenshotChannelDelete('s1'),
        nullField: 'screenshotChannel',
      },
      {
        name: 'enqueueDiscordServerVoteChannelCreate',
        call: () => adapters.enqueueDiscordServerVoteChannelCreate('s1', 'ch1'),
        nullField: 'voteChannel',
      },
      {
        name: 'enqueueDiscordServerVoteChannelDelete',
        call: () => adapters.enqueueDiscordServerVoteChannelDelete('s1'),
        nullField: 'voteChannel',
      },
      {
        name: 'enqueueDiscordServerSyncChatCreate',
        call: () => adapters.enqueueDiscordServerSyncChatCreate('s1', 'ch1'),
        nullField: 'syncChat',
      },
      {
        name: 'enqueueDiscordServerSyncChatDelete',
        call: () => adapters.enqueueDiscordServerSyncChatDelete('s1'),
        nullField: 'syncChat',
      },
      {
        name: 'enqueueDiscordGuildRemoveSyncRoles',
        call: () => adapters.enqueueDiscordGuildRemoveSyncRoles('g1', 'd1', ['r1']),
        nullField: 'processed',
      },
      {
        name: 'enqueueDiscordServerStatusRefresh',
        call: () => adapters.enqueueDiscordServerStatusRefresh('s1'),
        nullField: 'refreshed',
      },
    ]

    for (const { name, call, nullField } of errorCases) {
      it(`${name} throws with the reply's error message`, async () => {
        mockReply({
          correlationId: 'x',
          error: `${name} failed upstream`,
          [nullField]: nullField === 'processed' || nullField === 'refreshed' ? false : null,
        })
        await expect(call()).rejects.toThrow(`${name} failed upstream`)
      })
    }
  })

  it('enqueueDiscordGuildUpdateBotProfile returns {updated, error} without throwing on error', async () => {
    mockReply({ correlationId: 'x', updated: false, error: 'bot profile locked' })
    const result = await adapters.enqueueDiscordGuildUpdateBotProfile({ guildID: 'g1', username: 'New' })
    expect(result).toEqual({ updated: false, error: 'bot profile locked' })
  })

  it('enqueueDiscordGuildUpdateBotProfile returns {updated} with error undefined on success', async () => {
    mockReply({ correlationId: 'x', updated: true })
    const result = await adapters.enqueueDiscordGuildUpdateBotProfile({ guildID: 'g1' })
    expect(result).toEqual({ updated: true, error: undefined })
  })

  it('enqueueDiscordServerStatusRefreshAsync enqueues and returns the correlationId without waiting for a reply', async () => {
    const correlationId = await adapters.enqueueDiscordServerStatusRefreshAsync('s1')

    expect(typeof correlationId).toBe('string')
    expect(queueInstances.get('discord-guildOps')!.add).toHaveBeenCalledWith(
      'serverStatusRefresh',
      expect.objectContaining({ serverID: 's1', correlationId }),
      expect.anything(),
    )
    expect(redisGetMock).not.toHaveBeenCalled()
  })

  describe('waitForReply polling behavior', () => {
    it('polls again and succeeds once the reply key appears', async () => {
      redisGetMock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ correlationId: 'x', hasGuild: true }))

      const result = await adapters.enqueueMainClientHasGuild('g1', 2000)

      expect(result).toBe(true)
      expect(redisGetMock).toHaveBeenCalledTimes(2)
    })

    it('throws BullMQReplyTimeoutError when no reply arrives before the timeout', async () => {
      redisGetMock.mockResolvedValue(null)

      await expect(adapters.enqueueMainClientHasGuild('g1', 150)).rejects.toThrow(adapters.BullMQReplyTimeoutError)
    })

    it('isBullMQReplyTimeoutError identifies BullMQReplyTimeoutError instances', async () => {
      redisGetMock.mockResolvedValue(null)

      let caught: unknown
      try {
        await adapters.enqueueMainClientHasGuild('g1', 150)
      } catch (error) {
        caught = error
      }

      expect(adapters.isBullMQReplyTimeoutError(caught)).toBe(true)
      expect(adapters.isBullMQReplyTimeoutError(new Error('unrelated'))).toBe(false)
      expect(adapters.isBullMQReplyTimeoutError('not even an error')).toBe(false)
    })

    it('isBullMQReplyTimeoutError also recognizes a plain Error with a matching .name', () => {
      const lookalike = new Error('timed out')
      lookalike.name = 'BullMQReplyTimeoutError'
      expect(adapters.isBullMQReplyTimeoutError(lookalike)).toBe(true)
    })
  })

  describe('enqueueDiscordGuildSnapshot caching', () => {
    it('caches a successful guild snapshot and serves the second call from cache', async () => {
      mockReply({
        correlationId: 'x',
        guild: {
          id: 'guild-cache-1',
          name: 'Cached Guild',
          icon: null,
          ownerID: 'o1',
          preferredLocale: 'en-US',
          channels: [],
          roles: [],
          emojis: [],
        },
      })

      const first = await adapters.enqueueDiscordGuildSnapshot('guild-cache-1')
      const guildOpsAdd = queueInstances.get('discord-guildOps')!.add
      const callsAfterFirst = guildOpsAdd.mock.calls.length

      const second = await adapters.enqueueDiscordGuildSnapshot('guild-cache-1')

      expect(first).toMatchObject({ id: 'guild-cache-1' })
      expect(second).toBe(first)
      expect(guildOpsAdd.mock.calls.length).toBe(callsAfterFirst) // no new job enqueued for the cached call
    })

    it('dedupes concurrent in-flight requests for the same guild into one job', async () => {
      mockReply({
        correlationId: 'x',
        guild: {
          id: 'guild-inflight-1',
          name: 'In-flight Guild',
          icon: null,
          ownerID: 'o1',
          preferredLocale: 'en-US',
          channels: [],
          roles: [],
          emojis: [],
        },
      })

      const guildOpsAdd = queueInstances.get('discord-guildOps')!.add
      const callsBefore = guildOpsAdd.mock.calls.length

      const [a, b] = await Promise.all([
        adapters.enqueueDiscordGuildSnapshot('guild-inflight-1'),
        adapters.enqueueDiscordGuildSnapshot('guild-inflight-1'),
      ])

      expect(a).toBe(b)
      expect(guildOpsAdd.mock.calls.length).toBe(callsBefore + 1)
    })

    it('expires a cached (null) snapshot after its shorter TTL and re-queries', async () => {
      vi.useFakeTimers()
      try {
        mockReply({ correlationId: 'x', guild: null })
        const first = await adapters.enqueueDiscordGuildSnapshot('guild-expiry-1')
        expect(first).toBeNull()

        const guildOpsAdd = queueInstances.get('discord-guildOps')!.add
        const callsAfterFirst = guildOpsAdd.mock.calls.length

        // still within the null-cache TTL (3s): served from cache, no new job
        await vi.advanceTimersByTimeAsync(1000)
        await adapters.enqueueDiscordGuildSnapshot('guild-expiry-1')
        expect(guildOpsAdd.mock.calls.length).toBe(callsAfterFirst)

        // past the null-cache TTL: cache entry evicted, a fresh request is made
        await vi.advanceTimersByTimeAsync(2500)
        mockReply({ correlationId: 'x', guild: null })
        await adapters.enqueueDiscordGuildSnapshot('guild-expiry-1')
        expect(guildOpsAdd.mock.calls.length).toBe(callsAfterFirst + 1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('prunes/evicts once the cache reaches its max size', async () => {
      const guildOpsAdd = queueInstances.get('discord-guildOps')!.add

      for (let i = 0; i < 500; i++) {
        mockReply({ correlationId: 'x', guild: null })
        await adapters.enqueueDiscordGuildSnapshot(`guild-bulk-${i}`)
      }

      // crossing GUILD_SNAPSHOT_CACHE_MAX_ENTRIES (500) triggers a prune pass - proof of life
      // is that it didn't throw and every call actually enqueued a job.
      mockReply({ correlationId: 'x', guild: null })
      await adapters.enqueueDiscordGuildSnapshot('guild-bulk-500')

      expect(guildOpsAdd).toHaveBeenCalledTimes(501)
    })

    it('prune actually deletes entries that have already expired by the time it runs', async () => {
      vi.useFakeTimers()
      try {
        const guildOpsAdd = queueInstances.get('discord-guildOps')!.add

        for (let i = 0; i < 500; i++) {
          mockReply({ correlationId: 'x', guild: null })
          await adapters.enqueueDiscordGuildSnapshot(`guild-prune-${i}`)
        }

        // past every entry's null-cache TTL (3s): the next insert's prune pass should find and
        // delete every one of them, not just skip a full-but-still-fresh cache.
        await vi.advanceTimersByTimeAsync(3001)

        mockReply({ correlationId: 'x', guild: null })
        await adapters.enqueueDiscordGuildSnapshot('guild-prune-500')

        expect(guildOpsAdd).toHaveBeenCalledTimes(501)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
