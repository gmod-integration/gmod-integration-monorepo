const WINDOW_MS = 10_000
const MAX_MESSAGES = 30
const MAX_IN_FLIGHT = 2
export const DASHBOARD_MAX_MESSAGE_BYTES = 16 * 1024

/** Per-socket availability limits apply before parsing or resolving any account/Discord metadata. */
export function createDashboardMessageBudget(now: () => number = Date.now) {
  let windowStart = now()
  let messages = 0
  let active = 0
  return {
    enter(frame: Buffer | string) {
      const bytes = typeof frame === 'string' ? Buffer.byteLength(frame) : frame.byteLength
      if (bytes > DASHBOARD_MAX_MESSAGE_BYTES) return 'rejected' as const
      const current = now()
      if (current - windowStart >= WINDOW_MS) {
        messages = 0
        windowStart = current
      }
      if (messages >= MAX_MESSAGES) return 'rejected' as const
      messages++
      if (active >= MAX_IN_FLIGHT) return 'busy' as const
      active++
      return 'accepted' as const
    },
    release() {
      active = Math.max(0, active - 1)
    },
  }
}
