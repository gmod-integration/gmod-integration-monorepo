import type { Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { timeRequestStep } from '../../src/utils/requestTiming.js'

afterEach(() => vi.restoreAllMocks())

describe('request timing', () => {
  it('appends elapsed steps without replacing previous timing headers', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(22.5)
    const res = { headersSent: false, append: vi.fn() }
    expect(await timeRequestStep(res as unknown as Response, 'permissions', async () => true)).toBe(true)
    expect(res.append).toHaveBeenCalledExactlyOnceWith('Server-Timing', 'permissions;dur=12.5')
  })

  it('records a failed step and preserves its error', async () => {
    const res = { headersSent: false, append: vi.fn() }
    const error = new Error('Discord unavailable')
    await expect(
      timeRequestStep(res as unknown as Response, 'discord', async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(res.append).toHaveBeenCalledWith('Server-Timing', expect.stringMatching(/^discord;dur=\d+\.\d$/))
  })

  it('does not attempt to add headers to an already sent response', async () => {
    const res = { headersSent: true, append: vi.fn() }
    await timeRequestStep(res as unknown as Response, 'config', async () => 'done')
    expect(res.append).not.toHaveBeenCalled()
  })
})
