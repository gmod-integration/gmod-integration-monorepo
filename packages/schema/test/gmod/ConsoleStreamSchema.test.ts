import { describe, expect, it } from 'vitest'
import {
  ConsoleViewerRequestSchema,
  ConsoleSubscriptionSchema,
  ConsoleOutputSchema,
  ConsoleStreamCommandSchema,
  ConsoleRconRequestSchema,
  ConsoleRconResponseSchema,
} from '../../src/gmod/ConsoleStreamSchema.js'

describe('live server console contracts', () => {
  it('requires an explicit bounded server scope for viewer messages', () => {
    for (const action of ['console_subscribe', 'console_unsubscribe']) {
      expect(ConsoleViewerRequestSchema.safeParse({ action, data: { serverID: 'server-1' } }).success).toBe(true)
    }
    for (const data of [{}, { serverID: '' }, { serverID: 'private/path' }, { serverID: 's1', enabled: true }]) {
      expect(ConsoleViewerRequestSchema.safeParse({ action: 'console_subscribe', data }).success).toBe(false)
    }
  })

  it('validates subscription acknowledgements and text-only bounded output', () => {
    expect(
      ConsoleSubscriptionSchema.safeParse({ action: 'console_subscription', serverID: 's1', enabled: true }).success,
    ).toBe(true)
    expect(
      ConsoleSubscriptionSchema.safeParse({
        action: 'console_subscription',
        serverID: 's1',
        enabled: false,
        error: 'server_offline',
      }).success,
    ).toBe(true)
    const output = { action: 'console_live_exporter', serverID: 's1', data: { data: '<script>text only</script>\n' } }
    expect(ConsoleOutputSchema.safeParse(output).success).toBe(true)
    expect(ConsoleOutputSchema.safeParse({ ...output, data: { data: 'x'.repeat(32_769) } }).success).toBe(false)
    expect(ConsoleOutputSchema.safeParse({ ...output, data: { data: {} } }).success).toBe(false)
  })

  it('requires an expiring explicit activation and an immediate zero-deadline disable', () => {
    const command = { method: 'wsConsoleStream', enabled: true, expiresAt: 1_795_608_030_000 }
    expect(ConsoleStreamCommandSchema.safeParse(command).success).toBe(true)
    expect(ConsoleStreamCommandSchema.safeParse({ ...command, enabled: false, expiresAt: 0 }).success).toBe(true)
    for (const patch of [
      { expiresAt: 0 },
      { expiresAt: -1 },
      { expiresAt: 0.5 },
      { enabled: 'true' },
      { command: 'print(1)' },
    ]) {
      expect(ConsoleStreamCommandSchema.safeParse({ ...command, ...patch }).success).toBe(false)
    }
  })

  it('validates single-line RCON commands without accepting caller-supplied identities', () => {
    const input = { requestID: 'ccb34ff3-d4c7-4d2a-b9a1-1462197ed367', command: ' status ' }
    expect(ConsoleRconRequestSchema.parse(input).command).toBe('status')
    for (const patch of [
      { command: '' },
      { command: '  ' },
      { command: 'status\nquit' },
      { command: 'status\rquit' },
      { command: 'status\n' },
      { command: 'status\0' },
      { command: 'x'.repeat(8193) },
      { command: 'é'.repeat(4097) },
      { requestID: 'invalid' },
      { steamID: '76561198000000001' },
      { serverID: 'foreign' },
    ])
      expect(ConsoleRconRequestSchema.safeParse({ ...input, ...patch }).success).toBe(false)
    expect(ConsoleRconRequestSchema.safeParse({ ...input, command: 'é'.repeat(4096) }).success).toBe(true)
  })

  it('distinguishes acknowledged execution, explicit rejection and an uncertain delivery', () => {
    const scope = { serverID: 's1', requestID: 'ccb34ff3-d4c7-4d2a-b9a1-1462197ed367' }
    for (const result of [
      { status: 'executed', code: 'executed' },
      { status: 'rejected', code: 'permission_denied' },
      { status: 'rejected', code: 'expired' },
      { status: 'rejected', code: 'execution_failed' },
      { status: 'unknown', code: 'delivery_uncertain' },
    ])
      expect(ConsoleRconResponseSchema.safeParse({ ...scope, ...result }).success).toBe(true)
    expect(
      ConsoleRconResponseSchema.safeParse({ ...scope, status: 'executed', code: 'permission_denied' }).success,
    ).toBe(false)
    expect(ConsoleRconResponseSchema.safeParse({ ...scope, status: 'unknown', code: 'executed' }).success).toBe(false)
  })
})
