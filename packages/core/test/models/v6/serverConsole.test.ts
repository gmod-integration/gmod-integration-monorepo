import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@gmod/domain-auth/authSessions.js'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  const redis = new Redis()
  redis.status = 'ready'
  const evaluate = redis.eval.bind(redis)
  // Keep the mock's Redis clock coherent rather than mixing rounded Date and hrtime.
  redis.eval = (script: string, count: number, ...args: Array<string | number>) => {
    const now = Date.now()
    return evaluate(
      script.replaceAll("redis.call('TIME')", `{ '${Math.floor(now / 1000)}', '${(now % 1000) * 1000}' }`),
      count,
      ...args,
    )
  }
  return { redis }
})
vi.mock('@gmod/infra-redis', () => ({ default: redis }))
const access = vi.fn()
const assertCapability = vi.fn((snapshot: { premium: boolean; state: string }) => {
  if (!snapshot.premium)
    throw Object.assign(new Error('Access unavailable'), {
      status: snapshot.state === 'unknown' ? 503 : 403,
      code: snapshot.state === 'unknown' ? 'entitlement_unknown' : 'upgrade_required',
    })
})
vi.mock('@gmod/domain-access/index.js', () => ({ resolveGuildAccess: access, assertCapability }))
const user = vi.fn()
vi.mock('@gmod/domain-user/User.js', () => ({ getUserFromDiscordID: user }))
const dispatch = vi.fn()
vi.mock('@gmod/infra-websocket/addonCommands.js', () => ({ enqueuePanelRconAndWaitDetailed: dispatch }))
const { executeServerConsoleCommand } = await import('../../../src/models/v6/serverConsole.js')
const server = { id: 's1', guild: 'g1' }
const requestID = 'ccb34ff3-d4c7-4d2a-b9a1-1462197ed367'
const input = { requestID, command: 'status' }
const subjectDiscordID = '123456789012345678'
const time = new Date('2026-11-25T12:00:00Z').getTime()
const session = (patch: Partial<AuthSession> = {}): AuthSession => ({
  id: 'session-owner',
  discordID: subjectDiscordID,
  tokenHash: 'hash',
  createdAt: new Date(time),
  lastSeenAt: new Date(time),
  expiresAt: new Date(time + 3_600_000),
  absoluteExpiresAt: new Date(time + 3_600_000),
  ...patch,
})
const commandID = (index: number) => `ccb34ff3-d4c7-4d2a-b9a1-${index.toString(16).padStart(12, '0')}`

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(time)
  redis.status = 'ready'
  await redis.flushall()
  await redis.zadd('ws:server-presence:s1', time + 90_000, 'gateway-socket')
  access.mockReset().mockResolvedValue({ premium: true, state: 'ready' })
  assertCapability.mockClear()
  user.mockReset().mockRejectedValue(new Error('Panel RCON must not query a Steam identity'))
  dispatch.mockReset().mockResolvedValue('executed')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => redis.disconnect())

describe('authenticated dashboard console commands', () => {
  it('uses the verified panel identity without a Steam lookup and stores digests plus outcomes without command text', async () => {
    const command = 'echo private-command; status'
    const response = await executeServerConsoleCommand(server, session(), { requestID, command })
    expect(response).toEqual({ serverID: 's1', requestID, status: 'executed', code: 'executed' })
    expect(user).not.toHaveBeenCalled()
    expect(access).toHaveBeenCalledExactlyOnceWith('g1')
    expect(assertCapability).toHaveBeenCalledWith({ premium: true, state: 'ready' }, 'console.rcon')
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ serverID: 's1', actorDiscordID: subjectDiscordID, command })
    const ledger = await redis.get(`console:rcon:request:${requestID}`)
    expect(ledger).toMatch(/^[a-f0-9]{64}:result:/)
    expect(ledger).not.toContain(command)
    expect(ledger).not.toContain(subjectDiscordID)
    expect(await redis.pttl(`console:rcon:request:${requestID}`)).toBe(600_000)
    expect(await redis.exists('console:rcon:active:s1')).toBe(0)
  })

  it.each(['permission_denied', 'expired', 'execution_failed', 'delivery_uncertain'] as const)(
    'preserves the acknowledged or uncertain %s outcome',
    async (code) => {
      dispatch.mockResolvedValueOnce(code)
      expect(await executeServerConsoleCommand(server, session(), input)).toEqual({
        serverID: 's1',
        requestID,
        status: code === 'delivery_uncertain' ? 'unknown' : 'rejected',
        code,
      })
    },
  )

  it('allows an authorized delegated panel session and derives its actual actor independently from its subject', async () => {
    const actorDiscordID = '234567890123456789'
    const response = await executeServerConsoleCommand(
      server,
      session({ actorDiscordID, actorSessionID: 'support-session' }),
      input,
    )
    expect(response.status).toBe('executed')
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ serverID: 's1', actorDiscordID, command: input.command })
    expect(user).not.toHaveBeenCalled()
  })

  it.each(['ready', 'unknown'])('requires Premium with a currently known entitlement: %s', async (state) => {
    access.mockResolvedValueOnce({ premium: false, state })
    await expect(executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      status: state === 'unknown' ? 503 : 403,
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { ...input, command: '' },
    { ...input, command: 'status\n' },
    { ...input, command: 'status\0quit' },
    { ...input, command: 'é'.repeat(4097) },
    { ...input, steamID: '76561198000000002' },
    { ...input, actorDiscordID: '234567890123456789' },
    { ...input, serverID: 's2' },
  ])('rejects malformed commands or supplied identities before reserving: %j', async (raw) => {
    await expect(executeServerConsoleCommand(server, session(), raw)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(await redis.keys('console:rcon:*')).toEqual([])
  })

  it('does not dispatch to an offline server or expired gateway presence', async () => {
    await redis.del('ws:server-presence:s1')
    await expect(executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      status: 409,
      code: 'server_offline',
    })
    await redis.zadd('ws:server-presence:s1', time - 1, 'expired-gateway')
    await expect(executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      code: 'server_offline',
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns the recorded outcome for a repeated normalized request without dispatching twice or extending its TTL', async () => {
    const first = await executeServerConsoleCommand(server, session(), { ...input, command: ' status ' })
    vi.setSystemTime(time + 10_000)
    expect(
      await executeServerConsoleCommand(server, session(), { ...input, requestID: requestID.toUpperCase() }),
    ).toEqual(first)
    expect(dispatch).toHaveBeenCalledOnce()
    expect(await redis.pttl(`console:rcon:request:${requestID}`)).toBe(590_000)
  })

  it.each(['command', 'actor', 'subject', 'server'] as const)(
    'binds a request ID to the original %s',
    async (change) => {
      await executeServerConsoleCommand(server, session(), input)
      await expect(
        executeServerConsoleCommand(
          change === 'server' ? { ...server, id: 's2' } : server,
          session(
            change === 'actor'
              ? { actorDiscordID: '234567890123456789', actorSessionID: 'support' }
              : change === 'subject'
                ? { discordID: '345678901234567890', actorDiscordID: subjectDiscordID, actorSessionID: 'support' }
                : {},
          ),
          change === 'command' ? { ...input, command: 'quit' } : input,
        ),
      ).rejects.toMatchObject({ status: 409, code: 'request_conflict' })
      expect(dispatch).toHaveBeenCalledOnce()
    },
  )

  it('reserves across API replicas before dispatch, rejects pending duplicates and concurrent server commands', async () => {
    let finish!: (code: string) => void
    let started!: () => void
    const starting = new Promise<void>((resolve) => (started = resolve))
    dispatch.mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => (finish = resolve))
    })
    const first = executeServerConsoleCommand(server, session(), input)
    await starting
    vi.resetModules()
    const replica = await import('../../../src/models/v6/serverConsole.js')
    await expect(replica.executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      status: 409,
      code: 'request_pending',
    })
    await expect(
      replica.executeServerConsoleCommand(server, session(), { ...input, requestID: commandID(2) }),
    ).rejects.toMatchObject({ status: 409, code: 'command_in_progress' })
    finish('executed')
    expect((await first).status).toBe('executed')
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('records an unknown result after a thrown delivery attempt and never retries it', async () => {
    dispatch.mockRejectedValueOnce(new Error('private transport details'))
    const response = await executeServerConsoleCommand(server, session(), input)
    expect(response).toMatchObject({ status: 'unknown', code: 'delivery_uncertain' })
    expect(await executeServerConsoleCommand(server, session(), input)).toEqual(response)
    expect(dispatch).toHaveBeenCalledOnce()
    expect(JSON.stringify(response)).not.toContain('private')
  })

  it('does not let a delayed old completion overwrite a new reservation after the retention window', async () => {
    let finishOld!: (code: string) => void
    let finishNew!: (code: string) => void
    let startedOld!: () => void
    let startedNew!: () => void
    const oldStarted = new Promise<void>((resolve) => (startedOld = resolve))
    const newStarted = new Promise<void>((resolve) => (startedNew = resolve))
    dispatch.mockImplementationOnce(() => {
      startedOld()
      return new Promise((resolve) => (finishOld = resolve))
    })
    const oldRequest = executeServerConsoleCommand(server, session(), input)
    await oldStarted
    vi.setSystemTime(time + 600_001)
    await redis.zadd('ws:server-presence:s1', Date.now() + 90_000, 'new-gateway-socket')
    dispatch.mockImplementationOnce(() => {
      startedNew()
      return new Promise((resolve) => (finishNew = resolve))
    })
    const newRequest = executeServerConsoleCommand(server, session(), input)
    await newStarted
    finishOld('executed')
    await oldRequest
    await expect(executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      code: 'request_pending',
    })
    expect(await redis.exists('console:rcon:active:s1')).toBe(1)
    finishNew('permission_denied')
    expect((await newRequest).code).toBe('permission_denied')
    expect((await executeServerConsoleCommand(server, session(), input)).code).toBe('permission_denied')
  })

  it('keeps the pending tombstone if persisting a known ACK fails', async () => {
    const evaluate = redis.eval.bind(redis)
    vi.spyOn(redis, 'eval').mockImplementation((script: string, ...args: any[]) =>
      script.includes('local ttl =') ? Promise.reject(new Error('Redis unavailable')) : evaluate(script, ...args),
    )
    expect((await executeServerConsoleCommand(server, session(), input)).status).toBe('executed')
    await expect(executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      code: 'request_pending',
    })
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('enforces per-actor and per-server rate budgets without consuming extra quota for duplicate IDs', async () => {
    for (let index = 0; index < 60; index++) {
      const actor = session({ discordID: String(1000 + Math.floor(index / 12)) })
      await executeServerConsoleCommand(server, actor, { ...input, requestID: commandID(index) })
      await executeServerConsoleCommand(server, actor, { ...input, requestID: commandID(index) })
      if (index === 11)
        await expect(
          executeServerConsoleCommand(server, actor, { ...input, requestID: commandID(100) }),
        ).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    }
    await expect(
      executeServerConsoleCommand(server, session({ discordID: 'new-owner' }), { ...input, requestID: commandID(101) }),
    ).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    expect(dispatch).toHaveBeenCalledTimes(60)
  })

  it('keeps a delegated actor’s rate budget shared across its panel subjects', async () => {
    const actorDiscordID = '234567890123456789'
    for (let index = 0; index < 12; index++)
      await executeServerConsoleCommand(
        server,
        session({ discordID: String(2000 + index), actorDiscordID, actorSessionID: 'support-session' }),
        { ...input, requestID: commandID(index) },
      )
    await expect(
      executeServerConsoleCommand(
        server,
        session({ discordID: '3000', actorDiscordID, actorSessionID: 'support-session' }),
        { ...input, requestID: commandID(12) },
      ),
    ).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    expect(dispatch).toHaveBeenCalledTimes(12)
  })

  it('never queues an offline Redis reservation or dispatches after a timed-out late reservation', async () => {
    redis.status = 'reconnecting'
    await expect(executeServerConsoleCommand(server, session(), input)).rejects.toMatchObject({
      status: 503,
      code: 'console_unavailable',
    })
    redis.status = 'ready'
    const evaluate = redis.eval.bind(redis)
    let finish!: () => void
    vi.spyOn(redis, 'eval').mockImplementationOnce(
      (...args: any[]) => new Promise((resolve, reject) => (finish = () => evaluate(...args).then(resolve, reject))),
    )
    const pending = executeServerConsoleCommand(server, session(), input).catch((error) => error)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await pending).toMatchObject({ status: 503, code: 'console_unavailable' })
    finish()
    for (let tick = 0; tick < 5; tick++) await Promise.resolve()
    expect(dispatch).not.toHaveBeenCalled()
    expect(await redis.get(`console:rcon:request:${requestID}`)).toBeNull()
  })
})
