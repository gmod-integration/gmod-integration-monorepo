import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentryInitMock = vi.fn()
const nodeProfilingIntegrationMock = vi.fn(() => 'profiling-integration')
vi.mock('@sentry/node', () => ({ init: sentryInitMock }))
vi.mock('@sentry/profiling-node', () => ({ nodeProfilingIntegration: nodeProfilingIntegrationMock }))

let configServerMock: { dev: boolean; sentryDSN: string }
vi.mock('@gmod/config', () => ({
  get ConfigServer() {
    return configServerMock
  },
}))

describe('instrument', () => {
  beforeEach(() => {
    vi.resetModules()
    sentryInitMock.mockReset()
    nodeProfilingIntegrationMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes Sentry when not in dev mode', async () => {
    configServerMock = { dev: false, sentryDSN: 'https://dsn.example' }
    await import('../../src/utils/instrument.js')

    expect(sentryInitMock).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://dsn.example', tracesSampleRate: 1.0, profilesSampleRate: 1.0 }),
    )
  })

  it('skips Sentry initialization in dev mode', async () => {
    configServerMock = { dev: true, sentryDSN: 'https://dsn.example' }
    await import('../../src/utils/instrument.js')

    expect(sentryInitMock).not.toHaveBeenCalled()
  })
})
