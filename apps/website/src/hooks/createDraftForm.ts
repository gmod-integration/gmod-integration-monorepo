import { createMemo, createSignal, untrack } from 'solid-js'
import { createAsyncAction } from './createAsyncAction.js'
import { useDraftGuard } from './draftRegistry.js'

export type DraftErrors<T> = Partial<Record<keyof T, string>>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

/** Keep server normalization while applying only edits made after the submitted snapshot. */
function rebasePendingEdits(snapshot: unknown, current: unknown, accepted: unknown): unknown {
  if (JSON.stringify(snapshot) === JSON.stringify(current)) return accepted
  // Lists are replaced together: matching elements by position would lose insertions and removals.
  if (!isRecord(snapshot) || !isRecord(current) || !isRecord(accepted)) return current
  const rebased = { ...accepted }
  for (const key of new Set([...Object.keys(snapshot), ...Object.keys(current)])) {
    if (!Object.hasOwn(current, key)) {
      delete rebased[key]
    } else if (!Object.hasOwn(snapshot, key) || JSON.stringify(snapshot[key]) !== JSON.stringify(current[key])) {
      Object.defineProperty(rebased, key, {
        value: rebasePendingEdits(snapshot[key], current[key], accepted[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
  }
  return rebased
}

/** One saved snapshot and one local draft, shared by explicit editors and autosaved settings. */
export function createDraftForm<T>(options: {
  initial: T
  validate?: (values: T) => DraftErrors<T>
  errorMessage?: () => string
  equal?: (left: T, right: T) => boolean
  allowPendingEdits?: boolean
}) {
  const clone = (value: T): T => structuredClone(value)
  const equal = (left: T, right: T) => options.equal?.(left, right) ?? JSON.stringify(left) === JSON.stringify(right)
  const [saved, setSaved] = createSignal<T>(clone(options.initial))
  const [draft, writeDraft] = createSignal<T>(clone(options.initial))
  const action = createAsyncAction({
    errorMessage: options.errorMessage ?? (() => 'Unable to save. Please try again.'),
  })
  const dirty = createMemo(() => !equal(draft(), saved()))
  const errors = createMemo<DraftErrors<T>>(() => options.validate?.(draft()) ?? {})
  const valid = createMemo(() => Object.values(errors()).every((error) => !error))
  function setDraft(value: T | ((previous: T) => T)) {
    if (action.pending() && !options.allowPendingEdits) return
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
      const editedWhileSaving = options.allowPendingEdits && !equal(draft(), snapshot)
      const nextDraft = editedWhileSaving ? (rebasePendingEdits(snapshot, draft(), value) as T) : value
      setSaved(() => clone(value))
      writeDraft(() => clone(nextDraft))
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
