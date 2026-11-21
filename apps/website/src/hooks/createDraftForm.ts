import { createMemo, createSignal, untrack } from 'solid-js'
import { createAsyncAction } from './createAsyncAction.js'
import { useDraftGuard } from './draftRegistry.js'

export type DraftErrors<T> = Partial<Record<keyof T, string>>

/** One saved snapshot, one local draft, and an explicit commit for an entire form. */
export function createDraftForm<T>(options: {
  initial: T
  validate?: (values: T) => DraftErrors<T>
  errorMessage?: () => string
  equal?: (left: T, right: T) => boolean
}) {
  const clone = (value: T): T => structuredClone(value)
  const [saved, setSaved] = createSignal<T>(clone(options.initial))
  const [draft, writeDraft] = createSignal<T>(clone(options.initial))
  const action = createAsyncAction({
    errorMessage: options.errorMessage ?? (() => 'Unable to save. Please try again.'),
  })
  const dirty = createMemo(
    () => !(options.equal?.(draft(), saved()) ?? JSON.stringify(draft()) === JSON.stringify(saved())),
  )
  const errors = createMemo<DraftErrors<T>>(() => options.validate?.(draft()) ?? {})
  const valid = createMemo(() => Object.values(errors()).every((error) => !error))
  function setDraft(value: T | ((previous: T) => T)) {
    if (action.pending()) return
    action.reset()
    writeDraft(() => clone(typeof value === 'function' ? (value as (previous: T) => T)(draft()) : value))
  }
  function reset(value: T) {
    untrack(() => {
      if (action.pending()) return
      setSaved(() => clone(value))
      writeDraft(() => clone(value))
      action.reset()
    })
  }
  function discard() {
    reset(saved())
  }
  async function save(persist: (snapshot: T) => Promise<T | void>): Promise<boolean> {
    if (action.pending() || !dirty() || !valid()) return false
    const snapshot = clone(draft())
    return action.run(async () => {
      const accepted = await persist(snapshot)
      const value = accepted === undefined ? snapshot : accepted
      setSaved(() => clone(value))
      writeDraft(() => clone(value))
    })
  }
  useDraftGuard({ dirty, pending: action.pending, discard })
  return {
    draft,
    saved,
    dirty,
    errors,
    valid,
    setDraft,
    reset,
    discard,
    save,
    patch(value: Partial<T>) {
      setDraft((previous) => ({ ...previous, ...value }))
    },
    pending: action.pending,
    error: action.error,
    success: action.success,
  }
}
