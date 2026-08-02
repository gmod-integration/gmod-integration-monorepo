import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@gmod/infra-prisma', () => ({ default: {} }))
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromSteamID64: vi.fn() }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: vi.fn() }))
vi.mock('@gmod/infra-redis', () => ({ default: { set: vi.fn() } }))
vi.mock('../../../src/discord/index.js', () => ({
  getGuildClient: vi.fn(),
  getMainClient: vi.fn(),
  loadGuildBotInstance: vi.fn(),
}))
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ addAutoRoleToUser: vi.fn(), verifyUser: vi.fn() }))
vi.mock('../../../src/discord/utils/messages.js', () => ({ getVerificationGuildMessage: vi.fn() }))
vi.mock('@gmod/config', () => ({ ConfigDiscord: {} }))
vi.mock('@gmod/domain-guild/Guild.js', () => ({ getDiscordEntitlements: vi.fn() }))
vi.mock('@gmod/infra-minio', () => ({ ensureAvatarStored: vi.fn(), s3: { send: vi.fn() } }))
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn() }))

const {
  discordUpdatePseudoWorker,
  discordUpdateGroupWorker,
  discordUpdateTeamRoleWorker,
  discordMainClientOpsWorker,
  discordGuildOpsWorker,
  initializeDiscordQueueWorkers,
} = await import('../../../src/discord/workers/discordQueueWorkers.js')

describe('initializeDiscordQueueWorkers', () => {
  beforeEach(() => {
    gmLogMock.mockClear()
  })

  it('wires completed/failed listeners onto every worker and logs the completion', async () => {
    await initializeDiscordQueueWorkers()

    expect(gmLogMock).toHaveBeenCalledWith('bullmq', 'Initializing Discord queue workers...')
    expect(gmLogMock).toHaveBeenCalledWith('bullmq', 'Discord queue workers initialized')

    const workers = [
      { worker: discordUpdatePseudoWorker, tag: 'updatePseudo' },
      { worker: discordUpdateGroupWorker, tag: 'updateGroup' },
      { worker: discordUpdateTeamRoleWorker, tag: 'updateTeamRole' },
      { worker: discordMainClientOpsWorker, tag: 'mainClientOps' },
      { worker: discordGuildOpsWorker, tag: 'guildOps' },
    ]

    for (const { worker, tag } of workers) {
      gmLogMock.mockClear()
      ;(worker as unknown as EventEmitter).emit('completed', { id: 'job-1' })
      expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', `[${tag}] Job completed: job-1`)

      gmLogMock.mockClear()
      ;(worker as unknown as EventEmitter).emit('failed', { id: 'job-2' }, new Error('kaboom'))
      expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', `[${tag}] Job failed: job-2 - kaboom`)

      gmLogMock.mockClear()
      ;(worker as unknown as EventEmitter).emit('failed', undefined, new Error('kaboom2'))
      expect(gmLogMock).toHaveBeenCalledWith('bullmq-worker', `[${tag}] Job failed: undefined - kaboom2`)
    }
  })
})
