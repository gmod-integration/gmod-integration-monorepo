import { gmLog } from '@gmod/shared/logger.js'

/** Discord-only grants and expiry keep progressing even while a game server is offline. */
export function startRewardsWorker(): () => void {
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      const { sweepPendingRewards } = await import('@gmod/core/models/v6/rewards.js')
      if (!stopped) await sweepPendingRewards()
    } catch {
      gmLog('rewards', 'Pending reward processing is temporarily unavailable.', true)
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), 30_000)
  timer.unref()
  void tick()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
