import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redis } = await vi.hoisted(async () => {
  const { default: Redis } = await import('ioredis-mock')
  return { redis: new Redis() }
})
vi.mock('@gmod/infra-redis', () => ({ default: redis }))
const dispatch = vi.fn()
vi.mock('../src/queues.js', () => ({ enqueueWSSendToServerAndWait: dispatch }))
const {
  enqueueAddonRconAndWait,
  enqueueAddonRconAndWaitDetailed,
  enqueuePanelRconAndWaitDetailed,
  acceptAddonCommandResult,
} = await import('../src/addonCommands.js')
const input = { serverID: 'server-1', steamID: '76561198000000001', command: 'status' }
const panelInput = { serverID: 'server-1', actorDiscordID: '123456789012345678', command: 'status' }
const success = (id: string) => ({
  action: 'addon.command-result',
  method: 'wsAuthorizedRcon',
  id,
  ok: true,
  code: 'executed',
})

beforeEach(async () => {
  vi.useFakeTimers()
  await redis.flushall()
  dispatch.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => redis.disconnect())

async function start() {
  dispatch.mockResolvedValueOnce(true)
  const waiting = enqueueAddonRconAndWait(input, 100)
  await vi.advanceTimersByTimeAsync(0)
  const packet = dispatch.mock.calls[0][0].data
  return { waiting, packet }
}

describe('authenticated addon execution acknowledgement', () => {
  it('does not mistake successful socket delivery for successful console execution', async () => {
    const { waiting, packet } = await start()
    expect(packet).toMatchObject({ method: 'wsAuthorizedRcon', steamID: input.steamID, command: 'status' })
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('accepts a matching addon result and cleans its pending state', async () => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe(true)
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })

  it('rejects another authenticated server and unknown request IDs', async () => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult('foreign-server', success(packet.requestID))
    await acceptAddonCommandResult(input.serverID, success('5a918b48-ff6f-4ed4-b2b9-f4b722840f04'))
    expect(await redis.keys('ws:addon-command:*:result')).toEqual([])
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
  })

  it.each([
    { ok: true, code: 'permission_denied' },
    { ok: false, code: 'executed' },
    { method: 'wsRunLua' },
    { secret: 'unexpected' },
  ])('rejects malformed or contradictory acknowledgements %j', async (changes) => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult(input.serverID, { ...success(packet.requestID), ...changes })
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
  })

  it('preserves the first terminal result and never upgrades a denial to success', async () => {
    const { waiting, packet } = await start()
    await acceptAddonCommandResult(input.serverID, {
      ...success(packet.requestID),
      ok: false,
      code: 'permission_denied',
    })
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe(false)
  })

  it('ignores expired results without recreating completion state', async () => {
    const { waiting, packet } = await start()
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe(false)
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })

  it('does not dispatch malformed remote input', async () => {
    await expect(enqueueAddonRconAndWait({ ...input, command: 'status\nquit' })).rejects.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })

  it('returns false for an undelivered command and cleans up a queue failure', async () => {
    dispatch.mockResolvedValueOnce(false)
    expect(await enqueueAddonRconAndWait(input)).toBe(false)
    dispatch.mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(enqueueAddonRconAndWait(input)).rejects.toThrow('queue unavailable')
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
  })
})

describe('detailed console execution outcomes', () => {
  it('returns uncertainty without dispatching when pending-command storage rejects', async () => {
    vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('Pending-command storage unavailable'))
    await expect(enqueuePanelRconAndWaitDetailed(panelInput, 100)).resolves.toBe('delivery_uncertain')
    expect(dispatch).not.toHaveBeenCalled()
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['executed', 'permission_denied', 'expired', 'execution_failed'] as const)(
    'returns the authenticated terminal addon outcome: %s',
    async (code) => {
      dispatch.mockResolvedValueOnce(true)
      const waiting = enqueueAddonRconAndWaitDetailed(input, 100)
      await vi.advanceTimersByTimeAsync(0)
      const packet = dispatch.mock.calls[0][0].data
      await acceptAddonCommandResult(input.serverID, { ...success(packet.requestID), ok: code === 'executed', code })
      await vi.advanceTimersByTimeAsync(50)
      expect(await waiting).toBe(code)
    },
  )

  it.each(['false', 'error'] as const)(
    'prefers an already stored addon ACK when queue delivery returns %s',
    async (failure) => {
      dispatch.mockImplementationOnce(async ({ data }) => {
        await acceptAddonCommandResult(input.serverID, success(data.requestID))
        if (failure === 'error') throw new Error('Queue acknowledgement unavailable')
        return false
      })
      const waiting = enqueueAddonRconAndWaitDetailed(input, 100)
      await vi.advanceTimersByTimeAsync(50)
      expect(await waiting).toBe('executed')
    },
  )

  it('accepts the addon ACK while the queue delivery acknowledgement is still pending', async () => {
    dispatch.mockReturnValueOnce(new Promise(() => {}))
    const waiting = enqueueAddonRconAndWaitDetailed(input, 100)
    await vi.advanceTimersByTimeAsync(0)
    const packet = dispatch.mock.calls[0][0].data
    await acceptAddonCommandResult(input.serverID, success(packet.requestID))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe('executed')
  })

  it.each(['rejected', 'stalled'] as const)('does not degrade a known ACK when cleanup is %s', async (failure) => {
    vi.spyOn(redis, 'del').mockImplementationOnce(() =>
      failure === 'rejected' ? Promise.reject(new Error('Cleanup failed')) : new Promise(() => {}),
    )
    dispatch.mockResolvedValueOnce(true)
    const waiting = enqueueAddonRconAndWaitDetailed(input, 100)
    await vi.advanceTimersByTimeAsync(0)
    await acceptAddonCommandResult(input.serverID, success(dispatch.mock.calls[0][0].data.requestID))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe('executed')
  })

  it('returns unknown for missing ACKs and bounds a stalled result store', async () => {
    dispatch.mockResolvedValueOnce(true)
    vi.spyOn(redis, 'get').mockReturnValueOnce(new Promise(() => {}))
    const waiting = enqueueAddonRconAndWaitDetailed(input, 100)
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe('delivery_uncertain')
  })

  it('does not enqueue an expired command after a delayed pending-key write', async () => {
    const set = redis.set.bind(redis)
    let finish!: () => void
    vi.spyOn(redis, 'set').mockImplementationOnce(
      (...args: any[]) => new Promise((resolve, reject) => (finish = () => set(...args).then(resolve, reject))),
    )
    const waiting = enqueueAddonRconAndWaitDetailed(input, 100)
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe('delivery_uncertain')
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('panel-authorized console commands', () => {
  it.each(['false', 'error'] as const)(
    'waits for a later addon ACK when the queue reports %s before the command deadline',
    async (failure) => {
      dispatch.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            setTimeout(() => {
              if (failure === 'error') reject(new Error('Queue acknowledgement unavailable'))
              else resolve(false)
            }, 600)
          }),
      )
      const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 5000)
      let settled = false
      void waiting.then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(0)
      const packet = dispatch.mock.calls[0][0].data
      await vi.advanceTimersByTimeAsync(700)
      expect(settled).toBe(false)
      expect(await redis.get(`ws:addon-command:${packet.requestID}`)).not.toBeNull()
      await vi.advanceTimersByTimeAsync(300)
      await acceptAddonCommandResult(panelInput.serverID, { ...success(packet.requestID), method: 'wsPanelRcon' })
      await vi.advanceTimersByTimeAsync(50)
      expect(await waiting).toBe('executed')
      expect(dispatch).toHaveBeenCalledOnce()
      expect(await redis.keys('ws:addon-command:*')).toEqual([])
    },
  )

  it('keeps a failed queue acknowledgement bounded by the original deadline without dispatching again', async () => {
    dispatch.mockResolvedValueOnce(false)
    const reads = vi.spyOn(redis, 'get')
    const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 1000)
    let settled = false
    void waiting.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(700)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(301)
    expect(await waiting).toBe('delivery_uncertain')
    expect(dispatch).toHaveBeenCalledOnce()
    expect(await redis.keys('ws:addon-command:*')).toEqual([])
    const completedReads = reads.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(reads).toHaveBeenCalledTimes(completedReads)
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('sends the authenticated panel actor without Steam or an in-game player requirement', async () => {
    dispatch.mockResolvedValueOnce(true)
    const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 100)
    await vi.advanceTimersByTimeAsync(0)
    const packet = dispatch.mock.calls[0][0].data
    expect(packet).toMatchObject({
      method: 'wsPanelRcon',
      actorDiscordID: panelInput.actorDiscordID,
      command: 'status',
    })
    expect(packet).not.toHaveProperty('steamID')
    await acceptAddonCommandResult(panelInput.serverID, { ...success(packet.requestID), method: 'wsPanelRcon' })
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe('executed')
  })

  it.each(['wsAuthorizedRcon', 'wsPanelRcon'] as const)(
    'ignores an ACK for the other method before accepting the correct %s ACK',
    async (method) => {
      dispatch.mockResolvedValueOnce(true)
      const waiting =
        method === 'wsAuthorizedRcon'
          ? enqueueAddonRconAndWait(input, 100)
          : enqueuePanelRconAndWaitDetailed(panelInput, 100)
      await vi.advanceTimersByTimeAsync(0)
      const packet = dispatch.mock.calls[0][0].data
      const pendingKey = `ws:addon-command:${packet.requestID}`
      if (method === 'wsAuthorizedRcon') expect(await redis.get(pendingKey)).toBe(input.serverID)
      else expect(await redis.get(pendingKey)).toBe(JSON.stringify([input.serverID, method]))
      await acceptAddonCommandResult(input.serverID, {
        ...success(packet.requestID),
        method: method === 'wsPanelRcon' ? 'wsAuthorizedRcon' : 'wsPanelRcon',
      })
      expect(await redis.get(`${pendingKey}:result`)).toBeNull()
      await acceptAddonCommandResult(input.serverID, { ...success(packet.requestID), method })
      await vi.advanceTimersByTimeAsync(50)
      expect(await waiting).toBe(method === 'wsAuthorizedRcon' ? true : 'executed')
    },
  )

  it.each(['permission_denied', 'expired', 'execution_failed'] as const)(
    'preserves a panel command’s %s acknowledgement',
    async (code) => {
      dispatch.mockResolvedValueOnce(true)
      const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 100)
      await vi.advanceTimersByTimeAsync(0)
      await acceptAddonCommandResult(input.serverID, {
        ...success(dispatch.mock.calls[0][0].data.requestID),
        method: 'wsPanelRcon',
        ok: false,
        code,
      })
      await vi.advanceTimersByTimeAsync(50)
      expect(await waiting).toBe(code)
    },
  )

  it('does not accept a valid legacy ACK injected under a panel result key', async () => {
    dispatch.mockResolvedValueOnce(true)
    const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 100)
    await vi.advanceTimersByTimeAsync(0)
    const requestID = dispatch.mock.calls[0][0].data.requestID
    await redis.set(`ws:addon-command:${requestID}:result`, JSON.stringify(success(requestID)))
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe('delivery_uncertain')
  })

  it('leaves execution uncertain when a panel command has no matching ACK', async () => {
    dispatch.mockResolvedValueOnce(true)
    const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 100)
    await vi.advanceTimersByTimeAsync(101)
    expect(await waiting).toBe('delivery_uncertain')
  })

  it('preserves a panel execution ACK even when the delivery queue rejects afterwards', async () => {
    dispatch.mockImplementationOnce(async ({ data }) => {
      await acceptAddonCommandResult(input.serverID, { ...success(data.requestID), method: 'wsPanelRcon' })
      throw new Error('Delivery acknowledgement failed')
    })
    const waiting = enqueuePanelRconAndWaitDetailed(panelInput, 100)
    await vi.advanceTimersByTimeAsync(50)
    expect(await waiting).toBe('executed')
  })
})
