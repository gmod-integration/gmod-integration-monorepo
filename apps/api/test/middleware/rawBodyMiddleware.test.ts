import { describe, expect, it, vi } from 'vitest'
import rawBodyMiddleware from '../../src/middleware/rawBodyMiddleware.js'

describe('rawBodyMiddleware', () => {
  it('accumulates chunks onto req.rawBody and calls next', async () => {
    const handlers: Record<string, (chunk: any) => void> = {}
    const req: any = {
      on: vi.fn((event: string, cb: (chunk: any) => void) => {
        handlers[event] = cb
      }),
    }
    const next = vi.fn()

    await rawBodyMiddleware(req, {} as any, next)
    handlers.data('chunk1')
    handlers.data('chunk2')

    expect(req.rawBody).toBe('chunk1chunk2')
    expect(next).toHaveBeenCalledWith()
  })

  it('forwards a synchronous error from req.on to next', async () => {
    const error = new Error('boom')
    const req: any = {
      on: vi.fn(() => {
        throw error
      }),
    }
    const next = vi.fn()

    await rawBodyMiddleware(req, {} as any, next)

    expect(next).toHaveBeenCalledWith(error)
  })
})
