import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeCollection, makeGuildClient, makeJob, makeMember, makeRole } from './fixtures.js'

class FakeWorker extends EventEmitter {
  name: string
  processor: (job: any) => any
  opts: any
  constructor(name: string, processor: (job: any) => any, opts: any) {
    super()
    this.name = name
    this.processor = processor
    this.opts = opts
  }
}
vi.mock('bullmq', () => ({ Worker: FakeWorker }))
vi.mock('@gmod/infra-bullmq', () => ({ connection: {} }))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const prismaMock: any = {
  gm_guild_verify_msg: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const getUserFromSteamID64Mock = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: getUserFromSteamID64Mock }))

const getServerFromIDMock = vi.fn()
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: getServerFromIDMock }))

const redisMock = { set: vi.fn().mockResolvedValue(undefined) }
vi.mock('@gmod/infra-redis', () => ({ default: redisMock }))

const getGuildClientMock = vi.fn()
const getMainClientMock = vi.fn()
const loadGuildBotInstanceMock = vi.fn()
vi.mock('../../../src/discord/index.js', () => ({
  getGuildClient: getGuildClientMock,
  getMainClient: getMainClientMock,
  loadGuildBotInstance: loadGuildBotInstanceMock,
}))

const addAutoRoleToUserMock = vi.fn()
const verifyUserMock = vi.fn()
vi.mock('@gmod/domain-guild/discordModels.js', () => ({
  addAutoRoleToUser: addAutoRoleToUserMock,
  verifyUser: verifyUserMock,
}))

const getVerificationGuildMessageMock = vi.fn()
vi.mock('../../../src/discord/utils/messages.js', () => ({
  getVerificationGuildMessage: getVerificationGuildMessageMock,
}))

const configDiscordMock: any = { guildID: 'main-guild', clientID: 'main-client' }
vi.mock('@gmod/config', () => ({ ConfigDiscord: configDiscordMock }))

const getDiscordEntitlementsMock = vi.fn()
vi.mock('@gmod/domain-guild/Guild.js', () => ({ getDiscordEntitlements: getDiscordEntitlementsMock }))

const ensureAvatarStoredMock = vi.fn()
const s3SendMock = vi.fn()
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: ensureAvatarStoredMock, s3: { send: s3SendMock } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })) }))

const { discordGuildOpsWorker } = await import('../../../src/discord/workers/discordQueueWorkers.js')

function processor() {
  return (discordGuildOpsWorker as unknown as FakeWorker).processor
}

function resetAllMocks() {
  gmLogMock.mockClear()
  getServerFromIDMock.mockReset()
  redisMock.set.mockReset().mockResolvedValue(undefined)
  getGuildClientMock.mockReset()
  addAutoRoleToUserMock.mockReset().mockResolvedValue(undefined)
  verifyUserMock.mockReset()
}

function lastReplyPayload() {
  const call = redisMock.set.mock.calls.at(-1)
  return JSON.parse(call![1] as string)
}

describe('discordQueueWorkers - discordGuildOpsWorker (part 2: server CRUD job pairs)', () => {
  beforeEach(() => resetAllMocks())

  const crudCases = [
    {
      jobName: 'serverStatusCreate',
      data: { serverID: 's1', channelID: 'chan1', correlationId: 'c1' },
      resultKey: 'status',
      setupServer: (server: any, result: any) => {
        server.deleteStatus = vi.fn().mockResolvedValue(undefined)
        server.createStatus = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.createStatus).toHaveBeenCalledWith('chan1'),
      successResult: { server: 's1', channel: 'chan1', message: 'msg' },
      nullableOnFalsy: false,
    },
    {
      jobName: 'serverStatusDelete',
      data: { serverID: 's1', correlationId: 'c1' },
      resultKey: 'status',
      setupServer: (server: any, result: any) => {
        server.deleteStatus = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.deleteStatus).toHaveBeenCalled(),
      successResult: { server: 's1', channel: 'chan1', message: 'msg' },
      nullableOnFalsy: true,
    },
    {
      jobName: 'logsChannelCreate',
      data: { serverID: 's1', channelID: 'chan1', correlationId: 'c1' },
      resultKey: 'logsChannel',
      setupServer: (server: any, result: any) => {
        server.createLogsChannel = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.createLogsChannel).toHaveBeenCalledWith('chan1'),
      successResult: { serverID: 's1', channelID: 'chan1', webhookID: 'w1', webhookToken: 't1' },
      nullableOnFalsy: false,
    },
    {
      jobName: 'logsChannelDelete',
      data: { serverID: 's1', correlationId: 'c1' },
      resultKey: 'logsChannel',
      setupServer: (server: any, result: any) => {
        server.destroyLogsChannel = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.destroyLogsChannel).toHaveBeenCalled(),
      successResult: { serverID: 's1', channelID: 'chan1', webhookID: 'w1', webhookToken: 't1' },
      nullableOnFalsy: true,
    },
    {
      jobName: 'screenshotChannelCreate',
      data: { serverID: 's1', channelID: 'chan1', correlationId: 'c1' },
      resultKey: 'screenshotChannel',
      setupServer: (server: any, result: any) => {
        server.createScreenshotChannel = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.createScreenshotChannel).toHaveBeenCalledWith('chan1'),
      successResult: { server: 's1', adminCmd: false, channelID: 'chan1', webhook: 'w1', token: 't1' },
      nullableOnFalsy: false,
    },
    {
      jobName: 'screenshotChannelDelete',
      data: { serverID: 's1', correlationId: 'c1' },
      resultKey: 'screenshotChannel',
      setupServer: (server: any, result: any) => {
        server.destroyScreenshotChannel = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.destroyScreenshotChannel).toHaveBeenCalled(),
      successResult: { server: 's1', adminCmd: false, channelID: 'chan1', webhook: 'w1', token: 't1' },
      nullableOnFalsy: true,
    },
    {
      jobName: 'voteChannelCreate',
      data: { serverID: 's1', channelID: 'chan1', correlationId: 'c1' },
      resultKey: 'voteChannel',
      setupServer: (server: any, result: any) => {
        server.createVoteChannel = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.createVoteChannel).toHaveBeenCalledWith('chan1'),
      successResult: { serverID: 's1', channelID: 'chan1', webhookID: 'w1', webhookToken: 't1' },
      nullableOnFalsy: false,
    },
    {
      jobName: 'voteChannelDelete',
      data: { serverID: 's1', correlationId: 'c1' },
      resultKey: 'voteChannel',
      setupServer: (server: any, result: any) => {
        server.destroyVoteChannel = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.destroyVoteChannel).toHaveBeenCalled(),
      successResult: { serverID: 's1', channelID: 'chan1', webhookID: 'w1', webhookToken: 't1' },
      nullableOnFalsy: true,
    },
    {
      jobName: 'syncChatCreate',
      data: { serverID: 's1', channelID: 'chan1', correlationId: 'c1' },
      resultKey: 'syncChat',
      setupServer: (server: any, result: any) => {
        server.createSyncChat = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.createSyncChat).toHaveBeenCalledWith('chan1'),
      successResult: { guild: 'g1', channel: 'chan1', server: 's1', id: 'w1', token: 't1' },
      nullableOnFalsy: false,
    },
    {
      jobName: 'syncChatDelete',
      data: { serverID: 's1', correlationId: 'c1' },
      resultKey: 'syncChat',
      setupServer: (server: any, result: any) => {
        server.destroySyncChat = vi.fn().mockResolvedValue(result)
      },
      call: (server: any) => expect(server.destroySyncChat).toHaveBeenCalled(),
      successResult: { guild: 'g1', channel: 'chan1', server: 's1', id: 'w1', token: 't1' },
      nullableOnFalsy: true,
    },
  ]

  for (const testCase of crudCases) {
    describe(testCase.jobName, () => {
      it('replies with an error when the server is not found', async () => {
        getServerFromIDMock.mockResolvedValueOnce(null)
        await processor()(makeJob(testCase.jobName, testCase.data))
        expect(lastReplyPayload()).toEqual({
          correlationId: 'c1',
          [testCase.resultKey]: null,
          error: 'Server not found',
        })
      })

      it('replies with the created/deleted record on success', async () => {
        const server: any = {}
        testCase.setupServer(server, testCase.successResult)
        getServerFromIDMock.mockResolvedValueOnce(server)
        await processor()(makeJob(testCase.jobName, testCase.data))
        testCase.call(server)
        expect(lastReplyPayload()).toEqual({ correlationId: 'c1', [testCase.resultKey]: testCase.successResult })
      })

      if (testCase.nullableOnFalsy) {
        it('replies with null when the destroy call resolves falsy', async () => {
          const server: any = {}
          testCase.setupServer(server, undefined)
          getServerFromIDMock.mockResolvedValueOnce(server)
          await processor()(makeJob(testCase.jobName, testCase.data))
          expect(lastReplyPayload()).toEqual({ correlationId: 'c1', [testCase.resultKey]: null })
        })
      }

      it('replies with an error when the server call throws', async () => {
        getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
        await processor()(makeJob(testCase.jobName, testCase.data))
        expect(lastReplyPayload()).toEqual({
          correlationId: 'c1',
          [testCase.resultKey]: null,
          error: 'db down',
        })
      })
    })
  }

  describe('serverStatusRefresh', () => {
    it('replies with an error when the server is not found', async () => {
      getServerFromIDMock.mockResolvedValueOnce(null)
      await processor()(makeJob('serverStatusRefresh', { serverID: 's1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', refreshed: false, error: 'Server not found' })
    })

    it('refreshes the status channel/message and replies refreshed=true', async () => {
      const statusData = { players: 5 }
      const server = {
        getStatusData: vi.fn().mockResolvedValue(statusData),
        editStatusChannelAndMessage: vi.fn().mockResolvedValue(undefined),
      }
      getServerFromIDMock.mockResolvedValueOnce(server)
      await processor()(makeJob('serverStatusRefresh', { serverID: 's1', correlationId: 'c1' }))
      expect(server.editStatusChannelAndMessage).toHaveBeenCalledWith(statusData)
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', refreshed: true })
    })

    it('replies refreshed=false with the error message when it throws', async () => {
      getServerFromIDMock.mockRejectedValueOnce(new Error('db down'))
      await processor()(makeJob('serverStatusRefresh', { serverID: 's1', correlationId: 'c1' }))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', refreshed: false, error: 'db down' })
    })
  })

  describe('guildRemoveSyncRoles', () => {
    function baseData(overrides: Record<string, any> = {}) {
      return { guildID: 'g1', discordID: 'd1', candidateRoleIDs: ['r1', 'r2'], correlationId: 'c1', ...overrides }
    }

    it('replies with an error when the guild cannot be fetched', async () => {
      const client = makeGuildClient(null)
      client.guilds.fetch = vi.fn().mockRejectedValueOnce(new Error('nope'))
      getGuildClientMock.mockResolvedValueOnce(client)
      await processor()(makeJob('guildRemoveSyncRoles', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: false, error: 'Guild not found' })
    })

    it('replies with an error when the member cannot be fetched', async () => {
      const guild = { members: { fetch: vi.fn().mockRejectedValueOnce(new Error('nope')) } }
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))
      await processor()(makeJob('guildRemoveSyncRoles', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: false, error: 'Member not found' })
    })

    it('removes candidate roles present on the member and always calls addAutoRoleToUser', async () => {
      const r1 = makeRole('r1')
      const rolesCache = new FakeCollection<string, any>([['r1', r1]])
      const member = makeMember('d1', { rolesCache })
      const guild = { members: { fetch: vi.fn().mockResolvedValueOnce(member) } }
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))

      await processor()(makeJob('guildRemoveSyncRoles', baseData()))

      expect(member.roles.remove).toHaveBeenCalled()
      expect(addAutoRoleToUserMock).toHaveBeenCalledWith(guild, member)
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: true })
    })

    it('skips role removal when no candidate roles are present, but still calls addAutoRoleToUser', async () => {
      const member = makeMember('d1')
      const guild = { members: { fetch: vi.fn().mockResolvedValueOnce(member) } }
      getGuildClientMock.mockResolvedValueOnce(makeGuildClient(guild))

      await processor()(makeJob('guildRemoveSyncRoles', baseData()))

      expect(member.roles.remove).not.toHaveBeenCalled()
      expect(addAutoRoleToUserMock).toHaveBeenCalledWith(guild, member)
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: true })
    })

    it('replies with an error when an unexpected error occurs', async () => {
      getGuildClientMock.mockRejectedValueOnce(new Error('boom'))
      await processor()(makeJob('guildRemoveSyncRoles', baseData()))
      expect(lastReplyPayload()).toEqual({ correlationId: 'c1', processed: false, error: 'boom' })
    })
  })

  it('does nothing and writes no reply for an unrecognized job name', async () => {
    await processor()(makeJob('not-a-real-job', {}))
    expect(redisMock.set).not.toHaveBeenCalled()
  })
})
