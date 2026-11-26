import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  servers: vi.fn(),
  reconcile: vi.fn(),
  processDiscord: vi.fn(),
}))

vi.mock('@gmod/infra-prisma', () => ({
  default: { gm_user: { findUnique: mocks.user }, gm_server: { findMany: mocks.servers } },
}))
vi.mock('../../../src/models/v6/rewards.js', () => ({
  reconcilePlayerRewards: mocks.reconcile,
  processPendingDiscordRewards: mocks.processDiscord,
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.user.mockResolvedValue(null)
  mocks.servers.mockResolvedValue([])
  mocks.reconcile.mockResolvedValue(undefined)
  mocks.processDiscord.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('reward source events', () => {
  it('coalesces concurrent events for one player and releases the slot after reconciliation', async () => {
    const gate = deferred()
    mocks.reconcile.mockReturnValueOnce(gate.promise)
    const { notifyPlayerRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    const first = notifyPlayerRewards('server', 'steam')
    expect(notifyPlayerRewards('server', 'steam')).toBe(first)
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith('server', 'steam'))
    expect(mocks.processDiscord).not.toHaveBeenCalled()

    await notifyPlayerRewards('other-server', 'steam')
    expect(mocks.processDiscord).toHaveBeenCalledExactlyOnceWith('other-server')
    gate.resolve()
    await first
    expect(mocks.processDiscord).toHaveBeenLastCalledWith('server')
    await notifyPlayerRewards('server', 'steam')
    expect(mocks.reconcile).toHaveBeenCalledTimes(3)
  })

  it('bounds outstanding event work and accepts another event once capacity is released', async () => {
    const gate = deferred()
    mocks.reconcile.mockReturnValue(gate.promise)
    const { notifyPlayerRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    const pending = Array.from({ length: 1024 }, (_, index) => notifyPlayerRewards('server', `player-${index}`))
    await expect(notifyPlayerRewards('server', 'overflow')).resolves.toBeUndefined()
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1024))
    expect(mocks.reconcile).not.toHaveBeenCalledWith('server', 'overflow')
    gate.resolve()
    await Promise.all(pending)
    await notifyPlayerRewards('server', 'overflow')
    expect(mocks.reconcile).toHaveBeenLastCalledWith('server', 'overflow')
    expect(mocks.processDiscord).toHaveBeenCalledTimes(1025)
  })

  it.each(['reconcile', 'processDiscord'] as const)(
    'keeps a source event successful after a %s failure and allows a later retry',
    async (provider) => {
      mocks[provider].mockRejectedValueOnce(new Error('private provider failure'))
      const { notifyPlayerRewards } = await import('../../../src/models/v6/rewardsEvents.js')
      await expect(notifyPlayerRewards('server', 'steam')).resolves.toBeUndefined()
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        'Rewards evaluation is temporarily unavailable; pending rewards will be reconciled later.',
      )
      await notifyPlayerRewards('server', 'steam')
      expect(mocks.reconcile).toHaveBeenCalledTimes(2)
      expect(mocks.processDiscord).toHaveBeenLastCalledWith('server')
    },
  )

  it.each([null, { steam: null }, { steam: '' }])('ignores a vote without a linked Steam account: %j', async (user) => {
    mocks.user.mockResolvedValue(user)
    const { notifyVoteRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    await notifyVoteRewards('server', 'discord')
    expect(mocks.user).toHaveBeenCalledExactlyOnceWith({ where: { id: 'discord' }, select: { steam: true } })
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('reconciles the Steam identity found for a voter', async () => {
    mocks.user.mockResolvedValue({ steam: 'linked-steam' })
    const { notifyVoteRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    await notifyVoteRewards('server', 'discord')
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith('server', 'linked-steam')
    expect(mocks.processDiscord).toHaveBeenCalledExactlyOnceWith('server')
  })

  it('reconciles a verified player across guild servers with at most four simultaneous operations', async () => {
    mocks.servers.mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({ id: `server-${index}` })))
    const gates = [deferred(), deferred(), deferred()]
    let active = 0
    let maximum = 0
    mocks.reconcile.mockImplementation(async (server: string) => {
      active++
      maximum = Math.max(maximum, active)
      await gates[Math.floor(Number(server.slice(7)) / 4)].promise
      active--
    })
    const { notifyVerifiedRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    const pending = notifyVerifiedRewards('guild', 'steam')
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(4))
    gates[0].resolve()
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(8))
    gates[1].resolve()
    await vi.waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(9))
    gates[2].resolve()
    await pending
    expect(maximum).toBe(4)
    expect(mocks.servers).toHaveBeenCalledExactlyOnceWith({
      where: { guild: 'guild' },
      select: { id: true },
      take: 1000,
    })
    expect(mocks.reconcile.mock.calls).toEqual(Array.from({ length: 9 }, (_, index) => [`server-${index}`, 'steam']))
    expect(mocks.processDiscord).toHaveBeenCalledTimes(9)
  })

  it('accepts verification in a guild without servers', async () => {
    const { notifyVerifiedRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    await expect(notifyVerifiedRewards('guild', 'steam')).resolves.toBeUndefined()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('keeps vote and verification events successful during lookup outages and rate limits safe warnings', async () => {
    mocks.user.mockRejectedValue(new Error('private database details'))
    mocks.servers.mockRejectedValue(new Error('private database details'))
    const { notifyVoteRewards, notifyVerifiedRewards } = await import('../../../src/models/v6/rewardsEvents.js')
    await expect(notifyVoteRewards('server', 'discord')).resolves.toBeUndefined()
    await expect(notifyVerifiedRewards('guild', 'steam')).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 60_000)
    await expect(notifyVerifiedRewards('guild', 'steam')).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('private'))
  })
})
