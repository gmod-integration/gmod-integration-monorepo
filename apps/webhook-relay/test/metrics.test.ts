import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetrics, type RelayMetrics } from '../src/metrics.js'

async function value(metrics: RelayMetrics, name: string) {
  const metric = metrics.registry.getSingleMetric(name)
  const data = await metric!.get()
  return data.values[0]?.value
}

describe('createMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the metric names of the standalone relay', async () => {
    const text = await createMetrics().registry.metrics()
    for (const name of [
      'relay_messages_total',
      'relay_messages_failed_total',
      'relay_messages_last_60_seconds',
      'relay_messages_last_300_seconds',
    ]) {
      expect(text).toContain(`# TYPE ${name}`)
    }
  })

  it('counts relayed messages over sliding 60s and 300s windows', async () => {
    const metrics = createMetrics()
    metrics.recordRelayed()
    metrics.recordRelayed()

    expect(await value(metrics, 'relay_messages_total')).toBe(2)
    expect(await value(metrics, 'relay_messages_last_60_seconds')).toBe(2)
    expect(await value(metrics, 'relay_messages_last_300_seconds')).toBe(2)

    vi.advanceTimersByTime(60_000)
    expect(await value(metrics, 'relay_messages_last_60_seconds')).toBe(0)
    expect(await value(metrics, 'relay_messages_last_300_seconds')).toBe(2)

    vi.advanceTimersByTime(240_000)
    expect(await value(metrics, 'relay_messages_last_300_seconds')).toBe(0)
    expect(await value(metrics, 'relay_messages_total')).toBe(2)
  })

  it('counts failures separately', async () => {
    const metrics = createMetrics()
    metrics.recordFailed()
    expect(await value(metrics, 'relay_messages_failed_total')).toBe(1)
    expect(await value(metrics, 'relay_messages_total')).toBe(0)
  })
})
