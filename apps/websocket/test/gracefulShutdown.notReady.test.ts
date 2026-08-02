import { describe, expect, it, vi } from 'vitest'

// gracefulShutdown() resolves its internal `wss.close()` promise immediately when `wss` was
// never assigned - this only happens if it's called before main() ever runs, so this file
// imports main.js fresh (without calling main()) to exercise that branch in isolation.

vi.mock('@gmod/core/utils/logger.js', () => ({ gmLog: vi.fn() }))
vi.mock('@gmod/config', () => ({ ConfigServer: { ports: { websocket: 9999 } } }))
vi.mock('@gmod/domain-server/Server.js', () => ({ getServerFromID: vi.fn(), getServersFromDiscordGuildID: vi.fn() }))
vi.mock('@gmod/domain-user/PanelUser.js', () => ({ getPanelUserFromDiscordID: vi.fn() }))
vi.mock('@gmod/domain-guild/discordModels.js', () => ({ getUserGuildsWithPermsForPanel: vi.fn() }))
vi.mock('@gmod/infra-prisma', () => ({
  connectPrisma: vi.fn().mockResolvedValue(undefined),
  gracefulShutdownPrisma: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@gmod/infra-redis', () => ({
  default: { duplicate: vi.fn() },
  gracefulShutdownRedis: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@gmod/core/utils/tools.js', () => ({ lastGmodIntegrationTag: 'v1.2.3', versionComparator: vi.fn() }))
vi.mock('@gmod/infra-bullmq', () => ({ connection: {} }))
vi.mock('@gmod/infra-websocket/queues.js', () => ({
  wsSendToServerQueue: { name: 'wsSendToServer' },
  wsSendToAllClientsOfServerQueue: { name: 'wsSendToAllClientsOfServer' },
}))
vi.mock('ws', () => ({ WebSocketServer: class {} }))
vi.mock('bullmq', () => ({ Worker: class {} }))

const { gracefulShutdown } = await import('../src/main.js')

describe('gracefulShutdown before main() has ever run', () => {
  it('resolves immediately since there is no wss/workers/subscriber to tear down yet', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    try {
      await gracefulShutdown()
      expect(exitSpy).toHaveBeenCalledWith(0)
    } finally {
      exitSpy.mockRestore()
    }
  })
})
