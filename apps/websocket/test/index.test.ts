import { describe, expect, it, vi } from 'vitest'

const mainMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../src/main.js', () => ({ main: mainMock }))

describe('websocket entrypoint (index.ts)', () => {
  it('calls main() on import', async () => {
    await import('../src/index.js')
    expect(mainMock).toHaveBeenCalled()
  })
})
