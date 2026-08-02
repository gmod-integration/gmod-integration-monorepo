import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setTokenMock = vi.fn()
const deleteMock = vi.fn()
class FakeREST {
  setToken(...args: any[]) {
    setTokenMock(...args)
    return this
  }
  delete = deleteMock
}
vi.mock('discord.js', () => ({ REST: FakeREST }))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { botToken: 'bot-token', clientID: 'client-1' },
}))

describe('discord_remove_cmd script', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    setTokenMock.mockClear()
    deleteMock.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('sets the bot token and deletes each configured command on success', async () => {
    deleteMock.mockResolvedValue(undefined)

    await import('../../src/discord/discord_remove_cmd.js')

    expect(setTokenMock).toHaveBeenCalledWith('bot-token')
    expect(deleteMock).toHaveBeenCalledWith('/applications/client-1/commands/1230296259160444971')
    expect(logSpy).toHaveBeenCalledWith('[INFO] Started removing application commands.')
    expect(logSpy).toHaveBeenCalledWith('[INFO] Removed command 1230296259160444971')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('logs the error when deleting a command fails', async () => {
    const failure = new Error('API down')
    deleteMock.mockRejectedValue(failure)

    await import('../../src/discord/discord_remove_cmd.js')

    expect(errorSpy).toHaveBeenCalledWith('[ERROR] Failed to remove application commands.')
    expect(errorSpy).toHaveBeenCalledWith(failure)
  })
})
