import { describe, expect, it, vi } from 'vitest'
import { createAsyncAction } from '../../src/hooks/createAsyncAction.js'

describe('createAsyncAction', () => {
  it('blocks duplicate submissions until the active request settles', async () => {
    const action = createAsyncAction({ errorMessage: () => 'Please try again.' })
    let complete!: () => void
    const first = action.run(() => new Promise<void>((resolve) => (complete = resolve)))
    const duplicate = vi.fn()
    expect(action.pending()).toBe(true)
    expect(await action.run(duplicate)).toBe(false)
    expect(duplicate).not.toHaveBeenCalled()
    complete()
    expect(await first).toBe(true)
    expect(action.pending()).toBe(false)
    expect(action.success()).toBe(true)
  })

  it('shows a localized error, permits retry and resets feedback for the next edit', async () => {
    const action = createAsyncAction({ errorMessage: () => 'Enregistrement impossible.' })
    expect(
      await action.run(async () => {
        throw new Error('Private server details')
      }),
    ).toBe(false)
    expect(action.pending()).toBe(false)
    expect(action.error()).toBe('Enregistrement impossible.')
    expect(action.success()).toBe(false)
    expect(await action.run(async () => undefined)).toBe(true)
    expect(action.error()).toBeUndefined()
    expect(action.success()).toBe(true)
    action.reset()
    expect(action.success()).toBe(false)
  })
})
