import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sweep: vi.fn(), log: vi.fn() }))
vi.mock('@gmod/core/models/v6/rewards.js', () => ({ sweepPendingRewards: mocks.sweep }))
vi.mock('@gmod/shared/logger.js', () => ({ gmLog: mocks.log }))

const { startRewardsWorker } = await import('../src/rewardsWorker.js')

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  mocks.sweep.mockResolvedValue(undefined)
})

afterEach(() => vi.useRealTimers())

describe('pending rewards worker', () => {
  it('processes immediately and every30seconds, then cancels all future processing', async () => {
    const stop = startRewardsWorker()
    await vi.dynamicImportSettled()
    expect(mocks.sweep).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.sweep).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.sweep).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never overlaps a slow sweep and resumes after it completes', async () => {
    let complete!: () => void
    mocks.sweep.mockImplementationOnce(() => new Promise<void>((resolve) => (complete = resolve)))
    const stop = startRewardsWorker()
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.sweep).toHaveBeenCalledOnce()
    complete()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.sweep).toHaveBeenCalledTimes(2)
    stop()
  })

  it('logs a safe error and retries the next tick after a provider failure', async () => {
    mocks.sweep.mockRejectedValueOnce(new Error('private provider detail'))
    const stop = startRewardsWorker()
    await vi.dynamicImportSettled()
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith(
      'rewards',
      'Pending reward processing is temporarily unavailable.',
      true,
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.sweep).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not begin a sweep when stopped before its lazy dependency finishes loading', async () => {
    const callbacks: (() => void)[] = []
    const interval = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void) => {
      callbacks.push(callback)
      return { unref: vi.fn() } as any
    }) as any)
    const clear = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
    try {
      const stop = startRewardsWorker()
      stop()
      await vi.dynamicImportSettled()
      callbacks[0]()
      await vi.dynamicImportSettled()
      expect(mocks.sweep).not.toHaveBeenCalled()
      expect(clear).toHaveBeenCalledOnce()
    } finally {
      interval.mockRestore()
      clear.mockRestore()
    }
  })
})
