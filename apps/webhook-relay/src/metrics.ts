import { Counter, Gauge, Registry } from 'prom-client'

// Metric names are unchanged from the standalone gmod-integration/webhook_relay repo so existing
// Prometheus scrapes and Grafana dashboards keep working after the move.
export function createMetrics() {
  const registry = new Registry()

  const relayed = new Counter({
    name: 'relay_messages_total',
    help: 'Total relayed messages',
    registers: [registry],
  })
  const failed = new Counter({
    name: 'relay_messages_failed_total',
    help: 'Total failed messages',
    registers: [registry],
  })
  const last60Seconds = new Gauge({
    name: 'relay_messages_last_60_seconds',
    help: 'Messages relayed in last 60s',
    registers: [registry],
  })
  const last300Seconds = new Gauge({
    name: 'relay_messages_last_300_seconds',
    help: 'Messages relayed in last 300s',
    registers: [registry],
  })

  return {
    registry,
    recordRelayed() {
      relayed.inc()
      last60Seconds.inc()
      last300Seconds.inc()
      // unref() so these sliding-window timers never hold the process open during shutdown.
      setTimeout(() => last60Seconds.dec(), 60_000).unref()
      setTimeout(() => last300Seconds.dec(), 300_000).unref()
    },
    recordFailed() {
      failed.inc()
    },
  }
}

export type RelayMetrics = ReturnType<typeof createMetrics>
