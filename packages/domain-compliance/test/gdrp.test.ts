import { existsSync } from 'node:fs'
import * as nodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The source creates the export zip (fs.createWriteStream + archiver), then immediately reads
// it back (fs.createReadStream) to upload it via the (mocked) S3 client. Even after waiting for
// the write stream's 'close' event, under coverage-instrumented (slower) execution the
// subsequent real fs.createReadStream + fs.rmSync cleanup a few lines later in the source can
// still race the read stream's own async fd open often enough to be flaky. The zip's actual
// bytes don't matter here since the upload itself is mocked - so for `.zip` paths specifically,
// hand back an in-memory stream instead of touching the real filesystem, sidestepping the race
// entirely. Every other fs call (writing the export JSON/log files, archiving, cleanup) still
// goes through the real filesystem, same as the other domain-compliance behavior under test.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>()
  const createReadStream: typeof nodeFs.createReadStream = (path, options) => {
    if (typeof path === 'string' && path.endsWith('.zip')) {
      return Readable.from(['fake-zip-bytes']) as unknown as ReturnType<typeof nodeFs.createReadStream>
    }
    return actual.createReadStream(path, options as never)
  }
  return { ...actual, createReadStream, default: { ...actual, createReadStream } }
})

vi.mock('@gmod/config', () => ({
  ConfigServer: { domain: 'https://api.gmod-integration.com', websiteUrl: 'https://gmod-integration.com' },
}))

const gmLogMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: gmLogMock }))

const addNotificationMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/core/utils/tools.js', () => ({ addNotification: addNotificationMock }))

const getLogsBySteamIDListMock = vi.fn()
const getLogsCountBySteamIDListMock = vi.fn()
vi.mock('@gmod/core/database/gm_server_logs.js', () => ({
  getLogsBySteamIDList: getLogsBySteamIDListMock,
  getLogsCountBySteamIDList: getLogsCountBySteamIDListMock,
}))

const getErrorsBySteamIDMock = vi.fn()
const getErrorsCountBySteamIDMock = vi.fn()
vi.mock('@gmod/domain-gmod/GmodErrors.js', () => ({
  getErrorsBySteamID: getErrorsBySteamIDMock,
  getErrorsCountBySteamID: getErrorsCountBySteamIDMock,
}))

const s3SendMock = vi.fn()
const createBucketIfNotExistsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@gmod/infra-minio', () => ({
  s3: { send: s3SendMock },
  createBucketIfNotExists: createBucketIfNotExistsMock,
}))

const prismaMock = {
  gm_users_data_request: { create: vi.fn(), update: vi.fn() },
  gm_user: { findUnique: vi.fn() },
  gm_server_vote: { findMany: vi.fn() },
  banUsers: { findMany: vi.fn() },
  gm_users_transfers: { findMany: vi.fn() },
  gm_user_steam: { findUnique: vi.fn() },
  gm_server_warn: { findMany: vi.fn() },
  users: { findMany: vi.fn() },
  gm_gmodstore_purchases: { findMany: vi.fn() },
  gm_server_screenshots: { findMany: vi.fn() },
  gm_server_report_bugs: { findMany: vi.fn() },
}
vi.mock('@gmod/infra-prisma', () => ({ default: prismaMock }))

const { getUserDataGRPD } = await import('../src/gdrp.js')

function fakeUser(discordID: string | null, steamID64: string | null) {
  return { getDiscordID: () => discordID, getSteamID64: () => steamID64 } as any
}

function resetAllMocks() {
  gmLogMock.mockReset()
  addNotificationMock.mockReset().mockResolvedValue(undefined)
  getLogsBySteamIDListMock.mockReset()
  getLogsCountBySteamIDListMock.mockReset().mockResolvedValue(0)
  getErrorsBySteamIDMock.mockReset()
  getErrorsCountBySteamIDMock.mockReset().mockResolvedValue(0)
  s3SendMock.mockReset()
  createBucketIfNotExistsMock.mockReset().mockResolvedValue(undefined)

  for (const table of Object.values(prismaMock)) {
    for (const fn of Object.values(table)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }

  prismaMock.gm_users_data_request.create.mockResolvedValue({ id: `req-${Math.random().toString(36).slice(2)}` })
  prismaMock.gm_users_data_request.update.mockResolvedValue({})
  prismaMock.gm_user.findUnique.mockResolvedValue(null)
  prismaMock.gm_server_vote.findMany.mockResolvedValue([])
  prismaMock.banUsers.findMany.mockResolvedValue([])
  prismaMock.gm_users_transfers.findMany.mockResolvedValue([])
  prismaMock.gm_user_steam.findUnique.mockResolvedValue(null)
  prismaMock.gm_server_warn.findMany.mockResolvedValue([])
  prismaMock.users.findMany.mockResolvedValue([])
  prismaMock.gm_gmodstore_purchases.findMany.mockResolvedValue([])
  prismaMock.gm_server_screenshots.findMany.mockResolvedValue([])
  prismaMock.gm_server_report_bugs.findMany.mockResolvedValue([])

  s3SendMock.mockImplementation(async (command: any) => {
    // Synchronously (before any await) make sure a request-body stream can never produce an
    // unhandled 'error' event, regardless of what timing race the source's later
    // fs.rmSync(zipFilePath) might otherwise win against a still-pending fd open/close.
    command.input?.Body?.on?.('error', () => {})

    if (command.constructor.name === 'GetObjectCommand') {
      return { Body: Readable.from(['fake-image-bytes']) }
    }
    if (command.constructor.name === 'PutObjectCommand' && command.input?.Body?.pipe) {
      // The real S3 SDK fully reads the request body stream before resolving; this mock must
      // do the same, otherwise the source's later fs.rmSync(zipFilePath) can race ahead of a
      // read stream that was created but never actually drained, producing a spurious ENOENT.
      await new Promise<void>((resolve) => {
        command.input.Body.on('data', () => {})
        command.input.Body.on('end', resolve)
        command.input.Body.on('close', resolve)
        command.input.Body.on('error', resolve)
      })
    }
    return {}
  })
}

describe('getUserDataGRPD', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it('exports data for a user with both a discordID and a steamID64, and notifies them', async () => {
    getLogsCountBySteamIDListMock.mockResolvedValueOnce(1)
    getLogsBySteamIDListMock.mockResolvedValueOnce([{ type: 'chat', data: 'hi' }])
    getErrorsCountBySteamIDMock.mockResolvedValueOnce(1)
    getErrorsBySteamIDMock.mockResolvedValueOnce({ errors: [{ error: 'boom' }], query: { total: 1 } })
    prismaMock.gm_server_screenshots.findMany.mockResolvedValue([
      { url: 'https://api.gmod-integration.com/screenshots/2025_1_76561198219049673_abc.jpeg' },
    ])

    const request = await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(request.status).toBe('ready')
    expect(request.downloadLink).toBe(`https://api.gmod-integration.com/gdpr-request/${request.id}`)
    expect(prismaMock.gm_users_data_request.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: request.id }, data: expect.objectContaining({ status: 'ready' }) }),
    )
    expect(addNotificationMock).toHaveBeenCalledWith('d1', 'gdpr', expect.stringContaining('GDPR request is ready'))
    expect(createBucketIfNotExistsMock).toHaveBeenCalledWith('gmi-gdpr-exports')

    // scratch dirs are cleaned up afterward
    expect(existsSync(join(tmpdir(), 'gmod-integration', 'gdpr', request.id))).toBe(false)
  })

  it('skips the discord export branch and notification when there is no discordID', async () => {
    const request = await getUserDataGRPD(fakeUser(null, '76561198219049673'))

    expect(prismaMock.gm_user.findUnique).not.toHaveBeenCalled()
    expect(addNotificationMock).not.toHaveBeenCalled()
    expect(request.status).toBe('ready')
  })

  it('skips the steam export branch entirely when there is no steamID64', async () => {
    const request = await getUserDataGRPD(fakeUser('d1', null))

    expect(prismaMock.gm_user_steam.findUnique).not.toHaveBeenCalled()
    expect(getLogsCountBySteamIDListMock).not.toHaveBeenCalled()
    expect(getErrorsCountBySteamIDMock).not.toHaveBeenCalled()
    expect(request.status).toBe('ready')
  })

  it('paginates server logs across multiple files when there are more logs than the page size', async () => {
    getLogsCountBySteamIDListMock.mockResolvedValueOnce(1500)
    getLogsBySteamIDListMock.mockResolvedValue([{ type: 'chat' }])

    await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(getLogsBySteamIDListMock).toHaveBeenCalledTimes(2)
    expect(getLogsBySteamIDListMock).toHaveBeenNthCalledWith(1, ['76561198219049673'], { limit: 1000, offset: 0 })
    expect(getLogsBySteamIDListMock).toHaveBeenNthCalledWith(2, ['76561198219049673'], { limit: 1000, offset: 1000 })
  })

  it('catches and logs a server-logs fetch failure instead of failing the export', async () => {
    getLogsCountBySteamIDListMock.mockRejectedValueOnce(new Error('mongo down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const request = await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(errorSpy).toHaveBeenCalledWith('Error fetching server logs:', expect.any(Error))
    expect(request.status).toBe('ready')
  })

  it('catches and logs an error-logs fetch failure instead of failing the export', async () => {
    getErrorsCountBySteamIDMock.mockRejectedValueOnce(new Error('mongo down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const request = await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(errorSpy).toHaveBeenCalledWith('Error fetching server logs:', expect.any(Error))
    expect(request.status).toBe('ready')
  })

  it('paginates error logs across multiple files when there are more errors than the page size', async () => {
    getErrorsCountBySteamIDMock.mockResolvedValueOnce(1200)
    getErrorsBySteamIDMock.mockResolvedValue({ errors: [{ error: 'e' }], query: { total: 1200 } })

    await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(getErrorsBySteamIDMock).toHaveBeenCalledTimes(2)
  })

  it('logs an error when a screenshot response has no stream body', async () => {
    prismaMock.gm_server_screenshots.findMany.mockResolvedValue([
      { url: 'https://api.gmod-integration.com/screenshots/2025_1_76561198219049673_abc.jpeg' },
    ])
    s3SendMock.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'GetObjectCommand') {
        return { Body: undefined }
      }
      return {}
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no stream returned for screenshot'))
  })

  it('catches and logs a failure uploading the export zip to MinIO', async () => {
    s3SendMock.mockImplementation(async (command: any) => {
      // Synchronous safety net (see resetAllMocks's default mock for why) plus a full drain,
      // so the source's later fs.rmSync(zipFilePath) can't race a still-pending fd on this
      // stream - only then simulate the upload failure.
      command.input?.Body?.on?.('error', () => {})
      if (command.constructor.name === 'PutObjectCommand') {
        if (command.input?.Body?.pipe) {
          await new Promise<void>((resolve) => {
            command.input.Body.on('data', () => {})
            command.input.Body.on('close', resolve)
            command.input.Body.on('end', resolve)
            command.input.Body.on('error', resolve)
          })
          await new Promise((resolve) => setImmediate(resolve))
        }
        throw new Error('S3 is down')
      }
      return {}
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const request = await getUserDataGRPD(fakeUser('d1', '76561198219049673'))

    expect(errorSpy).toHaveBeenCalledWith('Error uploading zip to MinIO:', expect.any(Error))
    // the request is still marked ready even if the upload failed - matches current behavior
    expect(request.status).toBe('ready')
  })
})

// NOT covered here, deliberately: `archive.on('error', (err) => { throw err })` inside
// getUserDataGRPD. Rethrowing from inside an event-emission callback isn't inside any promise
// chain the function awaits, so triggering it for real either (a) surfaces as a process-level
// uncaughtException that races Vitest's own global handler (flaky pass/fail depending on
// listener order), or (b) — as tried and reverted here — leaves archiver's internal state
// broken enough to hang the test. Exercising it safely would need either changing this
// error-handling shape in the source (out of scope for a coverage pass) or a much heavier
// archiver mock than the rest of this file needs. Flagged in the Phase 4 report rather than
// forcing a flaky or hanging test to hit one defensive line.
