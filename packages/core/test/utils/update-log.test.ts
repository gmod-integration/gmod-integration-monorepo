import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsSyncMock = vi.fn()
const mkdirSyncMock = vi.fn()
const writeFileSyncMock = vi.fn()
const readFileSyncMock = vi.fn()
const appendFileSyncMock = vi.fn()
vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    writeFileSync: writeFileSyncMock,
    readFileSync: readFileSyncMock,
    appendFileSync: appendFileSyncMock,
  },
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
  readFileSync: readFileSyncMock,
  appendFileSync: appendFileSyncMock,
}))

const cronScheduleMock = vi.fn()
vi.mock('node-cron', () => ({ default: { schedule: cronScheduleMock } }))

describe('update-log', () => {
  beforeEach(() => {
    vi.resetModules()
    existsSyncMock.mockReset()
    mkdirSyncMock.mockReset()
    writeFileSyncMock.mockReset()
    readFileSyncMock.mockReset()
    appendFileSyncMock.mockReset()
    cronScheduleMock.mockReset()
  })

  it('creates the logs folder/files on import when none exist yet, then rotates the log', async () => {
    existsSyncMock.mockReturnValue(false)
    readFileSyncMock.mockReturnValue('log contents')

    await import('../../src/utils/update-log.js')

    expect(mkdirSyncMock).toHaveBeenCalled()
    // two writeFileSync calls to create current.log and the dated log, plus one to clear current.log
    expect(writeFileSyncMock).toHaveBeenCalledTimes(3)
    expect(appendFileSyncMock).toHaveBeenCalledWith(expect.any(String), 'log contents')
    expect(cronScheduleMock).toHaveBeenCalledWith('0 0 * * *', expect.any(Function))
  })

  it('skips folder/file creation on the scheduled run when everything already exists', async () => {
    existsSyncMock.mockReturnValue(false)
    readFileSyncMock.mockReturnValue('')
    await import('../../src/utils/update-log.js')

    mkdirSyncMock.mockClear()
    writeFileSyncMock.mockClear()
    existsSyncMock.mockReturnValue(true)

    const scheduledCallback = cronScheduleMock.mock.calls[0][1] as () => void
    scheduledCallback()

    expect(mkdirSyncMock).not.toHaveBeenCalled()
    // still clears current.log (last writeFileSync call) even when the files already existed
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1)
  })
})
