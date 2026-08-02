import { describe, expect, it, vi } from 'vitest'

vi.mock('@/middleware/v3/serverValidator.js', () => ({ default: vi.fn() }))
vi.mock('@/controllers/v3/serversControllers.js', () => ({
  getIGSettings: vi.fn(),
  getInfo: vi.fn(),
  getPublicToken: vi.fn(),
  postCHATMDepositMoney: vi.fn(),
  postCHATMReceiveMoney: vi.fn(),
  postCHATMSendMoney: vi.fn(),
  postCHATMTakeMoney: vi.fn(),
  postCHATMWithdrawMoney: vi.fn(),
  postDarkRPDropMoney: vi.fn(),
  postDarkRPPickedUpCheque: vi.fn(),
  postDarkRPPickedUpMoney: vi.fn(),
  postIGSettings: vi.fn(),
  postMultiLog: vi.fn(),
  postStatus: vi.fn(),
  serverImportWarns: vi.fn(),
  serverStart: vi.fn(),
  serverStop: vi.fn(),
}))
vi.mock('@/controllers/gmod/GmodErrorsControllers.js', () => ({ reportError: vi.fn() }))
vi.mock('@/controllers/v3/serversPlayersController.js', () => ({
  getPlayer: vi.fn(),
  playerBan: vi.fn(),
  playerChangeGroup: vi.fn(),
  playerChangeName: vi.fn(),
  playerChangeTeam: vi.fn(),
  playerConnect: vi.fn(),
  playerDeath: vi.fn(),
  playerDisconnect: vi.fn(),
  playerGive: vi.fn(),
  playerHurt: vi.fn(),
  playerInitialSpawn: vi.fn(),
  playerReady: vi.fn(),
  playerSay: vi.fn(),
  playerSpawn: vi.fn(),
  playerSpawnObject: vi.fn(),
  playerWarn: vi.fn(),
}))

const { default: router } = await import('../../../src/routes/v3/serversRoutes.js')

describe('serversRoutes', () => {
  it('registers the top-level server info route and a sample of player routes', () => {
    const paths = router.stack.map((layer: any) => layer.route?.path).filter(Boolean)
    expect(paths).toContain('/:serverID')
    expect(paths).toContain('/:serverID/players/:steamID64')
    expect(paths).toContain('/:serverID/players/:steamID64/dark-rp/drop-money')
    expect(paths).toContain('/:serverID/players/:steamID64/ch-atm/deposit-money')
  })
})
