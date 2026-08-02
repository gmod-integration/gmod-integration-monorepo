import { describe, expect, it, vi } from 'vitest'

const processDiscordMessageToGmodMock = vi.fn()
vi.mock('@gmod/core/models/v3/guildsControllerModels.js', () => ({
  processDiscordMessageToGmod: processDiscordMessageToGmodMock,
}))

const { sendMessageToGmod } = await import('../../../src/controllers/v3/guildsControllers.js')

describe('sendMessageToGmod', () => {
  it('delegates to processDiscordMessageToGmod', async () => {
    processDiscordMessageToGmodMock.mockResolvedValueOnce(undefined)
    const message = { content: 'hi' } as any
    await sendMessageToGmod(message)
    expect(processDiscordMessageToGmodMock).toHaveBeenCalledWith(message)
  })
})
