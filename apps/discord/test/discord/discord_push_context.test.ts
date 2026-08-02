import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setTokenMock = vi.fn()
const putMock = vi.fn()
class FakeREST {
  setToken(...args: any[]) {
    setTokenMock(...args)
    return this
  }
  put = putMock
}
vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>()
  return { ...actual, REST: FakeREST }
})

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { botToken: 'bot-token', clientID: 'client-1' },
}))

const readdirMock = vi.fn()
vi.mock('fs/promises', () => ({ readdir: readdirMock }))

// The source hardcodes 'apps/discord/src/discord/contexts' and 'apps/discord/src/discord/commands'
// (joined with process.cwd()) as the two directories it scans. To exercise the real per-file
// dynamic `import(filePath)` branches without touching the real command tree, the mocked
// readdir reports a single "folder" whose name is the relative path from that hardcoded base
// down to this test's __fixtures__ directory - so the join() the source performs lands on our
// fixture files for real.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/pushContextCommands')
const commandsBase = join(process.cwd(), 'apps/discord/src/discord/commands')
const contextsBase = join(process.cwd(), 'apps/discord/src/discord/contexts')
const folderFromCommands = relative(commandsBase, fixturesDir)
const folderFromContexts = relative(contextsBase, fixturesDir)

describe('discord_push_context script', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    setTokenMock.mockClear()
    putMock.mockReset()
    readdirMock.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('reads the directory failure branch for contexts, loads/pushes/warns/errors per command file for commands, and puts successfully', async () => {
    readdirMock.mockImplementation(async (path: string) => {
      if (path === contextsBase) throw new Error('ENOENT contexts')
      if (path === commandsBase) return [folderFromCommands]
      if (path === fixturesDir) return ['validCommand.ts', 'noDataCommand.ts', 'brokenCommand.ts', 'ignored.txt']
      throw new Error(`unexpected readdir path: ${path}`)
    })
    putMock.mockResolvedValueOnce(undefined)

    await import('../../src/discord/discord_push_context.js')

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] Failed to read directory apps/discord/src/discord/contexts'),
    )
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Pushed Command valid-cmd from'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING] The Command at'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] Failed to load Command from brokenCommand.ts'))
    expect(setTokenMock).toHaveBeenCalledWith('bot-token')
    expect(putMock).toHaveBeenCalledWith(`/applications/client-1/commands`, {
      body: [{ name: 'valid-cmd' }],
    })
    expect(logSpy).toHaveBeenCalledWith('[INFO] Successfully reloaded application.')
  })

  it('logs the outer failure when the final rest.put() call rejects', async () => {
    readdirMock.mockResolvedValue([])
    const failure = new Error('put failed')
    putMock.mockRejectedValueOnce(failure)

    await import('../../src/discord/discord_push_context.js')

    expect(errorSpy).toHaveBeenCalledWith('[ERROR] Failed to reload application.')
    expect(errorSpy).toHaveBeenCalledWith(failure)
  })
})
