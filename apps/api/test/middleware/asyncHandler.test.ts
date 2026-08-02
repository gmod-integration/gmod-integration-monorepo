import { describe, expect, it, vi } from 'vitest'
import asyncHandler from '../../src/middleware/asyncHandler.js'

describe('asyncHandler', () => {
  it('does not call next when the wrapped handler resolves', async () => {
    const handler = vi.fn().mockResolvedValueOnce(undefined)
    const next = vi.fn()
    asyncHandler(handler)({} as any, {} as any, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
  })

  it('forwards a rejection to next', async () => {
    const error = new Error('boom')
    const handler = vi.fn().mockRejectedValueOnce(error)
    const next = vi.fn()
    asyncHandler(handler)({} as any, {} as any, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).toHaveBeenCalledWith(error)
  })
})
