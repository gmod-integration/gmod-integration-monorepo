import { createSignal } from 'solid-js'

/** Shared lifecycle for explicit UI actions. Callers keep API requests and drafts in their page. */
export function createAsyncAction(options: { errorMessage: () => string }) {
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [success, setSuccess] = createSignal(false)

  return {
    pending,
    error,
    success,
    reset() {
      if (pending()) return
      setError(undefined)
      setSuccess(false)
    },
    async run(operation: () => Promise<unknown>): Promise<boolean> {
      if (pending()) return false
      setPending(true)
      setError(undefined)
      setSuccess(false)
      try {
        await operation()
        setSuccess(true)
        return true
      } catch {
        setError(options.errorMessage())
        return false
      } finally {
        setPending(false)
      }
    },
  }
}
