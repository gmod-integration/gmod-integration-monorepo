import { createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js'

interface AutosaveForm {
  draft: Accessor<unknown>
  dirty: Accessor<boolean>
  valid: Accessor<boolean>
  pending: Accessor<boolean>
  error: Accessor<string | undefined>
  success: Accessor<boolean>
}

export interface AutosaveState {
  queued: Accessor<boolean>
  pending: Accessor<boolean>
  error: Accessor<string | boolean | undefined>
  success: Accessor<boolean>
  retry: () => Promise<void>
}

/** Debounce setting changes, serialize writes, and leave a failed draft available for retry. */
export function createAutosave(options: {
  form: AutosaveForm
  save: () => unknown | Promise<unknown>
  enabled?: Accessor<boolean>
  delay?: number
}): AutosaveState {
  const { form } = options
  const [queued, setQueued] = createSignal(false)
  const [running, setRunning] = createSignal(false)
  const [unexpectedError, setUnexpectedError] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastAttempt: string | undefined
  let disposed = false

  const cancelTimer = () => {
    clearTimeout(timer)
    timer = undefined
    setQueued(false)
  }
  const canSave = () =>
    !disposed && (options.enabled?.() ?? true) && form.dirty() && form.valid() && !form.pending() && !running()

  async function run() {
    if (!canSave()) return
    cancelTimer()
    lastAttempt = JSON.stringify(form.draft())
    setUnexpectedError(false)
    setRunning(true)
    try {
      await untrack(options.save)
    } catch {
      setUnexpectedError(true)
    } finally {
      setRunning(false)
    }
  }

  createEffect(() => {
    const fingerprint = JSON.stringify(form.draft())
    const failed = !!form.error() || unexpectedError()
    const ready = canSave()
    cancelTimer()
    if (!ready || (failed && fingerprint === lastAttempt)) return
    setQueued(true)
    timer = setTimeout(() => void run(), options.delay ?? 400)
  })
  onCleanup(() => {
    disposed = true
    cancelTimer()
  })

  return {
    queued,
    pending: () => running() || form.pending(),
    error: () => form.error() || unexpectedError() || undefined,
    success: () => form.success() && !form.dirty(),
    async retry() {
      await run()
    },
  }
}
