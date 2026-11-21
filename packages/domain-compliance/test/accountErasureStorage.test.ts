import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const model = () => ({
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  })
  return {
    db: {
      gm_user_erasure: model(),
      gm_users_data_request: model(),
      gm_panelToken: model(),
      gm_discordToken: model(),
      gm_guild_member: model(),
      gm_users_transfers: model(),
      banUsers: model(),
      gm_server_stat_team_time: model(),
      gm_server_warn_options: model(),
      gm_server_warn: model(),
      gm_server_ban: model(),
      gm_server_report_bugs: model(),
      gm_server_screenshots: model(),
      gm_server_sync_chat_filter: model(),
      users: model(),
      gm_user_steam: model(),
      gm_gmodstore_purchases: model(),
      gm_server_logs_triggers: model(),
      gm_server_status: model(),
      gm_user: model(),
      $transaction: vi.fn(),
    },
    s3: vi.fn(),
    mongoDB: vi.fn(),
    rm: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
    publish: vi.fn(),
  }
})
vi.mock('@gmod/infra-prisma', () => ({ default: mocks.db }))
vi.mock('@gmod/infra-minio', () => ({ AVATAR_BUCKET: 'test-avatars', s3: { send: mocks.s3 } }))
vi.mock('@gmod/infra-mongo', () => ({ mongoClient: { db: mocks.mongoDB } }))
vi.mock('@gmod/infra-redis', () => ({ default: { del: mocks.del, scan: mocks.scan, publish: mocks.publish } }))
vi.mock('@gmod/domain-user/privacy.js', () => ({
  PRIVACY_REVOCATION_CHANNEL: 'privacy-revocations',
  privacySubject: (kind: string, id: string) => `${kind}:opaque:${id}`,
}))
vi.mock('node:fs/promises', () => ({ default: { rm: mocks.rm } }))

const { containsErasureIdentity, eraseMongoData, eraseObjectData, eraseCachedData, eraseSqlData } =
  await import('../src/accountErasureStorage.js')
const identity = { discordID: 'discord-owner', steamID64: '76561198000000000' }
const exportID = 'c6801874-4d4b-4543-884c-80f379fe7299'
const fence = { requestId: exportID, leaseToken: 'worker-lease' }

beforeEach(() => {
  vi.resetAllMocks()
  for (const model of Object.values(mocks.db)) {
    if (typeof model === 'object' && 'findMany' in model) model.findMany.mockResolvedValue([])
  }
  mocks.db.gm_user_erasure.updateMany.mockResolvedValue({ count: 1 })
  mocks.db.$transaction.mockImplementation(async (operation) => operation(mocks.db))
  mocks.s3.mockImplementation(async (command) =>
    command instanceof ListObjectsV2Command ? { Contents: [], IsTruncated: false } : {},
  )
  mocks.scan.mockResolvedValue(['0', []])
})

function cursor(documents: unknown[]) {
  return {
    batchSize: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
    async *[Symbol.asyncIterator]() {
      yield* documents
    },
  }
}

describe('account erasure across storage boundaries', () => {
  it('finds identities in nested arrays, legacy JSON strings and indexed object keys without matching unrelated data', () => {
    expect(containsErasureIdentity({ event: [{ player: { id: identity.discordID } }] }, identity)).toBe(true)
    expect(containsErasureIdentity({ serialized: JSON.stringify({ admin: identity.steamID64 }) }, identity)).toBe(true)
    expect(containsErasureIdentity({ players: { [identity.steamID64]: { name: 'Player' } } }, identity)).toBe(true)
    expect(containsErasureIdentity({ players: [{ id: 'other-player' }], enabled: false, count: 2 }, identity)).toBe(
      false,
    )
    expect(
      containsErasureIdentity({ data: null, text: 'null' }, { discordID: identity.discordID, steamID64: null }),
    ).toBe(false)
  })

  it('scans both Mongo collections in bounded batches, deletes nested matches and leaves unrelated documents untouched', async () => {
    const logs = cursor([
      { _id: 'own-log', data: { author: identity.steamID64 } },
      { _id: 'third-party', player: 'another-player' },
    ])
    const errors = cursor([{ _id: 'own-error', context: JSON.stringify({ reporter: identity.discordID }) }])
    const deleteLog = vi.fn(),
      deleteError = vi.fn()
    mocks.mongoDB.mockReturnValue({
      collection: (name: string) => ({
        find: () => (name === 'logs' ? logs : errors),
        deleteOne: name === 'logs' ? deleteLog : deleteError,
      }),
    })
    await eraseMongoData(identity)
    expect(logs.batchSize).toHaveBeenCalledWith(250)
    expect(errors.batchSize).toHaveBeenCalledWith(250)
    expect(deleteLog).toHaveBeenCalledExactlyOnceWith({ _id: 'own-log' }, { maxTimeMS: 30_000 })
    expect(deleteError).toHaveBeenCalledExactlyOnceWith({ _id: 'own-error' }, { maxTimeMS: 30_000 })
    expect(logs.close).toHaveBeenCalled()
    expect(errors.close).toHaveBeenCalled()
  })

  it('propagates Mongo deletion failures to the durable worker and closes the scan', async () => {
    const logs = cursor([{ _id: 'own-log', player: identity.discordID }])
    mocks.mongoDB.mockReturnValue({
      collection: () => ({ find: () => logs, deleteOne: vi.fn().mockRejectedValue(new Error('Mongo unavailable')) }),
    })
    await expect(eraseMongoData(identity)).rejects.toThrow('Mongo unavailable')
    expect(logs.close).toHaveBeenCalled()
  })

  it('removes exports, temporary artifacts and avatars, then follows every screenshot listing page while preserving others', async () => {
    mocks.db.gm_users_data_request.findMany.mockResolvedValue([{ id: exportID }])
    mocks.s3.mockImplementation(async (command) => {
      if (!(command instanceof ListObjectsV2Command)) return {}
      return command.input.ContinuationToken
        ? { Contents: [{ Key: `${identity.steamID64}-second.png` }], IsTruncated: false }
        : {
            Contents: [{ Key: `${identity.steamID64}-first.png` }, { Key: 'other-player.png' }],
            IsTruncated: true,
            NextContinuationToken: 'page-2',
          }
    })
    await eraseObjectData(identity)
    const deletions = mocks.s3.mock.calls
      .filter(([command]) => command instanceof DeleteObjectCommand)
      .map(([command]) => command.input)
    expect(deletions).toEqual([
      { Bucket: 'gmi-gdpr-exports', Key: `${exportID}.zip` },
      { Bucket: 'test-avatars', Key: `discord/${identity.discordID}` },
      { Bucket: 'test-avatars', Key: `steam/${identity.steamID64}` },
      { Bucket: 'gmi-players-screenshots', Key: `${identity.steamID64}-first.png` },
      { Bucket: 'gmi-players-screenshots', Key: `${identity.steamID64}-second.png` },
    ])
    expect(mocks.rm).toHaveBeenCalledWith(expect.stringContaining(`/gmod-integration/gdpr/${exportID}`), {
      recursive: true,
      force: true,
    })
    expect(mocks.rm).toHaveBeenCalledWith(expect.stringContaining(`/gmod-integration/gdpr/${exportID}.zip`), {
      force: true,
    })
    const listing = mocks.s3.mock.calls
      .filter(([command]) => command instanceof ListObjectsV2Command)
      .map(([command]) => command.input)
    expect(listing).toEqual([
      { Bucket: 'gmi-players-screenshots', ContinuationToken: undefined, MaxKeys: 500 },
      { Bucket: 'gmi-players-screenshots', ContinuationToken: 'page-2', MaxKeys: 500 },
    ])
    expect(mocks.db.gm_users_data_request.deleteMany).not.toHaveBeenCalled()
  })

  it('does not turn non-UUID export metadata into a filesystem path', async () => {
    mocks.db.gm_users_data_request.findMany.mockResolvedValue([{ id: '../../outside' }])
    await eraseObjectData({ discordID: identity.discordID, steamID64: null })
    expect(mocks.rm).not.toHaveBeenCalled()
    expect(mocks.s3.mock.calls.some(([command]) => command instanceof ListObjectsV2Command)).toBe(false)
    expect(
      mocks.s3.mock.calls
        .filter(([command]) => command instanceof DeleteObjectCommand)
        .map(([command]) => command.input.Key),
    ).not.toContain('steam/null')
  })

  it('retries a broken object listing or a storage outage instead of assuming objects are absent', async () => {
    mocks.s3.mockImplementation(async (command) =>
      command instanceof ListObjectsV2Command ? { IsTruncated: true, Contents: [] } : {},
    )
    await expect(eraseObjectData(identity)).rejects.toThrow('Incomplete object listing')
    mocks.s3.mockRejectedValue(new Error('Access denied'))
    await expect(eraseObjectData(identity)).rejects.toThrow('Access denied')
  })

  it('treats missing objects and buckets as already erased, but does not swallow other failures', async () => {
    mocks.s3.mockRejectedValue(Object.assign(new Error('missing'), { name: 'NoSuchBucket' }))
    await expect(eraseObjectData(identity)).resolves.toBeUndefined()
    mocks.s3.mockRejectedValue(Object.assign(new Error('permission'), { name: 'AccessDenied' }))
    await expect(eraseObjectData(identity)).rejects.toMatchObject({ name: 'AccessDenied' })
  })

  it('scans every Redis cursor page, clears only account-related caches and publishes revocation', async () => {
    mocks.scan
      .mockResolvedValueOnce(['7', ['sync-role:gmod:server:s1:user:76561198000000000']])
      .mockResolvedValueOnce(['0', ['sync-pseudo:gmod:server:s2:user:76561198000000000']])
    await eraseCachedData(identity)
    expect(mocks.del).toHaveBeenCalledWith(
      `user:${identity.discordID}:guilds`,
      `user:${identity.discordID}:isWaitingGuilds`,
    )
    expect(mocks.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      `sync-*:gmod:server:*:user:${identity.steamID64}`,
      'COUNT',
      250,
    )
    expect(mocks.scan).toHaveBeenNthCalledWith(
      2,
      '7',
      'MATCH',
      `sync-*:gmod:server:*:user:${identity.steamID64}`,
      'COUNT',
      250,
    )
    expect(mocks.del).toHaveBeenCalledWith('sync-pseudo:gmod:server:s2:user:76561198000000000')
    expect(mocks.publish).toHaveBeenCalledWith('privacy-revocations', JSON.stringify(identity))
  })

  it('does not scan unrelated Steam caches when the account has never linked Steam', async () => {
    await eraseCachedData({ discordID: identity.discordID, steamID64: null })
    expect(mocks.scan.mock.calls.map(([, , pattern]) => pattern)).toEqual([
      'server:*:logsTrigger*',
      'server:*:gmodToDiscordFilter',
    ])
    expect(mocks.del).toHaveBeenCalledTimes(1)
  })

  it('retains minimized active global sanctions and other users’ moderation records while removing the subject’s data', async () => {
    await eraseSqlData(identity)
    expect(mocks.db.banUsers.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ discordID: identity.discordID }, { steamID64: identity.steamID64 }],
        permanent: false,
        unbanDate: { lte: expect.any(Date) },
      },
    })
    expect(mocks.db.banUsers.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ discordID: identity.discordID }, { steamID64: identity.steamID64 }] },
      data: { name: '', reason: 'Retained global security sanction' },
    })
    expect(mocks.db.gm_server_warn.deleteMany).toHaveBeenCalledWith({ where: { userSteamID64: identity.steamID64 } })
    expect(mocks.db.gm_server_warn.updateMany).toHaveBeenCalledWith({
      where: { adminSteamID64: identity.steamID64 },
      data: { adminSteamID64: '' },
    })
    expect(mocks.db.gm_server_ban.deleteMany).toHaveBeenCalledWith({ where: { userSteamID64: identity.steamID64 } })
    expect(mocks.db.gm_server_ban.updateMany).toHaveBeenCalledWith({
      where: { adminSteamID64: identity.steamID64 },
      data: { adminSteamID64: '' },
    })

    expect(mocks.db.gm_user.deleteMany).toHaveBeenCalledWith({ where: { id: identity.discordID } })
  })

  it('removes only this identity from shared trigger administrators and stored status players', async () => {
    mocks.db.gm_server_logs_triggers.findMany.mockResolvedValue([
      { id: 'trigger-1', adminIDS: JSON.stringify([identity.discordID, 'other-admin']) },
    ])
    mocks.db.gm_server_status.findMany.mockResolvedValue([
      { id: 'status-1', playersList: JSON.stringify([{ id: identity.steamID64 }, { id: 'other-player' }]) },
      { id: 'status-2', playersList: JSON.stringify([{ id: 'third-player' }]) },
    ])
    await eraseSqlData(identity)
    expect(mocks.db.gm_server_logs_triggers.update).toHaveBeenCalledWith({
      where: { id: 'trigger-1' },
      data: { adminIDS: '["other-admin"]' },
    })
    expect(mocks.db.gm_server_status.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'status-1' },
      data: { playersList: '[{"id":"other-player"}]' },
    })
  })

  it('erases Discord-only SQL data without inventing a Steam identity or touching Steam purchases', async () => {
    await eraseSqlData({ discordID: identity.discordID, steamID64: null })
    expect(mocks.db.gm_user_steam.deleteMany).not.toHaveBeenCalled()
    expect(mocks.db.gm_gmodstore_purchases.findUnique).not.toHaveBeenCalled()
    expect(mocks.db.gm_gmodstore_purchases.upsert).not.toHaveBeenCalled()
    expect(mocks.db.gm_gmodstore_purchases.deleteMany).not.toHaveBeenCalled()
    expect(mocks.db.banUsers.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ discordID: identity.discordID }], permanent: false, unbanDate: { lte: expect.any(Date) } },
    })
    expect(mocks.db.gm_user.deleteMany).toHaveBeenCalledWith({ where: { id: identity.discordID } })
  })

  it('fences each Mongo deletion and closes its cursor without changing data after lease loss', async () => {
    const logs = cursor([
      { _id: 'first', player: identity.discordID },
      { _id: 'second', player: identity.discordID },
    ])
    const remove = vi.fn()
    mocks.mongoDB.mockReturnValue({ collection: () => ({ find: () => logs, deleteOne: remove }) })
    mocks.db.gm_user_erasure.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await expect(eraseMongoData(identity, fence)).rejects.toThrow('Erasure lease lost')
    expect(remove).toHaveBeenCalledExactlyOnceWith({ _id: 'first' }, { maxTimeMS: 30_000 })
    expect(logs.close).toHaveBeenCalled()
    expect(mocks.db.gm_user_erasure.updateMany).toHaveBeenCalledWith({
      where: { id: fence.requestId, leaseToken: fence.leaseToken, status: 'running' },
      data: { leaseUntil: expect.any(Date) },
    })
  })

  it('stops S3 and filesystem mutation when the lease is lost and bounds each accepted object operation', async () => {
    mocks.db.gm_user_erasure.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await expect(eraseObjectData(identity, fence)).rejects.toThrow('Erasure lease lost')
    expect(mocks.s3).toHaveBeenCalledTimes(1)
    expect(mocks.s3).toHaveBeenCalledWith(expect.any(DeleteObjectCommand), { abortSignal: expect.any(AbortSignal) })
    expect(mocks.s3.mock.calls[0][0].input).toEqual({ Bucket: 'test-avatars', Key: `discord/${identity.discordID}` })
    expect(mocks.rm).not.toHaveBeenCalled()
  })

  it('locks the lease inside the SQL transaction before touching account data and refuses stale workers', async () => {
    mocks.db.gm_user_erasure.updateMany.mockResolvedValue({ count: 0 })
    await expect(eraseSqlData(identity, fence)).rejects.toThrow('Erasure lease lost')
    expect(mocks.db.gm_panelToken.deleteMany).not.toHaveBeenCalled()
    expect(mocks.db.gm_user.deleteMany).not.toHaveBeenCalled()
    mocks.db.gm_user_erasure.updateMany.mockResolvedValue({ count: 1 })
    await eraseSqlData(identity, fence)
    expect(mocks.db.gm_user_erasure.updateMany.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.db.gm_panelToken.deleteMany.mock.invocationCallOrder[0],
    )
  })

  it('does not clear caches or publish a revocation after losing its lease', async () => {
    mocks.db.gm_user_erasure.updateMany.mockResolvedValue({ count: 0 })
    await expect(eraseCachedData(identity, fence)).rejects.toThrow('Erasure lease lost')
    expect(mocks.del).not.toHaveBeenCalled()
    expect(mocks.scan).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('preserves screenshots and object names containing only a longer third-party numeric ID', async () => {
    const numericIdentity = { discordID: '12345', steamID64: identity.steamID64 }
    const screenshots = [
      {
        id: 'owned',
        player: JSON.stringify({ steamID64: identity.steamID64 }),
        captureData: '{}',
        url: 'https://api.example.test/screenshots/opaque-owned.png',
      },
      {
        id: 'longer-steam',
        player: JSON.stringify({ steamID64: `1${identity.steamID64}1` }),
        captureData: '{}',
        url: `https://api.example.test/screenshots/1${identity.steamID64}1.png`,
      },
      {
        id: 'longer-discord',
        player: '{"discordID":"123456"}',
        captureData: '{}',
        url: 'https://api.example.test/screenshots/other.png',
      },
    ]
    mocks.db.gm_server_screenshots.findMany.mockResolvedValue(screenshots)
    mocks.s3.mockImplementation(async (command) =>
      command instanceof ListObjectsV2Command
        ? { Contents: [{ Key: `1${identity.steamID64}1.png` }], IsTruncated: false }
        : {},
    )
    await eraseObjectData(numericIdentity, fence)
    const deletedObjects = mocks.s3.mock.calls
      .filter(([command]) => command instanceof DeleteObjectCommand)
      .map(([command]) => command.input.Key)
    expect(deletedObjects).toContain('opaque-owned.png')
    expect(deletedObjects).not.toContain(`1${identity.steamID64}1.png`)
    expect(deletedObjects).not.toContain('other.png')
    await eraseSqlData(numericIdentity, fence)
    expect(mocks.db.gm_server_screenshots.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['owned'] } },
    })
  })

  it('merges an entitlement idempotently so a second erasure never collides with its canonical retained purchase', async () => {
    const retainedKey = `erased:steam:opaque:${identity.steamID64}`
    const rows = new Map([
      [
        identity.steamID64,
        {
          steamID64: identity.steamID64,
          guild: 'guild-1',
          revoke: false,
          userID: 'private-user',
          token: 'private-token',
          updatedAt: new Date('2026-11-20'),
        },
      ],
      [
        retainedKey,
        {
          steamID64: retainedKey,
          guild: 'guild-1',
          revoke: false,
          userID: '',
          token: '',
          updatedAt: new Date('2026-11-19'),
        },
      ],
    ])
    mocks.db.gm_gmodstore_purchases.findUnique.mockImplementation(
      async ({ where }) => rows.get(where.steamID64) ?? null,
    )
    mocks.db.gm_gmodstore_purchases.upsert.mockImplementation(async ({ where, create, update }) => {
      const existing = rows.get(where.steamID64)
      const next = existing ? { ...existing, ...update } : create
      rows.set(where.steamID64, next)
      return next
    })
    mocks.db.gm_gmodstore_purchases.deleteMany.mockImplementation(async ({ where }) => {
      rows.delete(where.steamID64)
      return { count: 1 }
    })
    await eraseSqlData(identity)
    await eraseSqlData(identity)
    expect(rows.has(identity.steamID64)).toBe(false)
    expect(rows.get(retainedKey)).toMatchObject({ guild: 'guild-1', revoke: false, userID: '', token: '' })
    expect(mocks.db.gm_gmodstore_purchases.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.db.gm_gmodstore_purchases.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { steamID64: identity.steamID64 },
    })
  })

  it('preserves a newer refund and the retained community while detaching a reactivated account', async () => {
    const retainedKey = `erased:steam:opaque:${identity.steamID64}`
    mocks.db.gm_gmodstore_purchases.findUnique
      .mockResolvedValueOnce({ guild: '', revoke: false, updatedAt: new Date('2026-11-19') })
      .mockResolvedValueOnce({ guild: 'existing-guild', revoke: true, updatedAt: new Date('2026-11-21') })
    await eraseSqlData(identity)
    expect(mocks.db.gm_gmodstore_purchases.upsert).toHaveBeenCalledWith({
      where: { steamID64: retainedKey },
      create: { steamID64: retainedKey, guild: 'existing-guild', revoke: true, userID: '', token: '' },
      update: { guild: 'existing-guild', revoke: true, userID: '', token: '' },
    })
  })

  it('takes a community from the personal purchase only when the canonical entitlement has no community', async () => {
    mocks.db.gm_gmodstore_purchases.findUnique
      .mockResolvedValueOnce({ guild: 'new-guild', revoke: true, updatedAt: new Date('2026-11-21') })
      .mockResolvedValueOnce({ guild: '', revoke: false, updatedAt: new Date('2026-11-19') })
    await eraseSqlData(identity)
    expect(mocks.db.gm_gmodstore_purchases.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { guild: 'new-guild', revoke: true, userID: '', token: '' },
      }),
    )
  })

  it('fails instead of silently dropping either community entitlement when canonical and personal guilds differ', async () => {
    mocks.db.gm_gmodstore_purchases.findUnique
      .mockResolvedValueOnce({ guild: 'guild-1', revoke: false, updatedAt: new Date() })
      .mockResolvedValueOnce({ guild: 'guild-2', revoke: false, updatedAt: new Date() })
    await expect(eraseSqlData(identity)).rejects.toThrow('Conflicting collective entitlements')
    expect(mocks.db.gm_gmodstore_purchases.upsert).not.toHaveBeenCalled()
    expect(mocks.db.gm_gmodstore_purchases.deleteMany).not.toHaveBeenCalled()
    expect(mocks.db.gm_user.deleteMany).not.toHaveBeenCalled()
  })
})
