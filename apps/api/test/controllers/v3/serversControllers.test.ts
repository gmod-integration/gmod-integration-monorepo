import { beforeEach, describe, expect, it, vi } from 'vitest'

const logServerMock = vi.fn()
vi.mock('@gmod/core/utils/logger.js', () => ({ logServer: logServerMock }))

const modelMocks = {
  processCHATMDepositMoney: vi.fn(),
  processCHATMReceiveMoney: vi.fn(),
  processCHATMSendMoney: vi.fn(),
  processCHATMTakeMoney: vi.fn(),
  processCHATMWithdrawMoney: vi.fn(),
  processDarkRPDropMoney: vi.fn(),
  processDarkRPPickedUpCheque: vi.fn(),
  processDarkRPPickedUpMoney: vi.fn(),
  processMultiLog: vi.fn(),
  processPostIGSettings: vi.fn(),
  processPostStatus: vi.fn(),
  processServerImportWarns: vi.fn(),
}
vi.mock('@gmod/core/models/v3/serversControllerModels.js', () => modelMocks)

const {
  postIGSettings,
  getIGSettings,
  postStatus,
  serverImportWarns,
  serverStart,
  serverStop,
  getInfo,
  getPublicToken,
  postDarkRPDropMoney,
  postDarkRPPickedUpMoney,
  postDarkRPPickedUpCheque,
  postCHATMTakeMoney,
  postCHATMReceiveMoney,
  postCHATMSendMoney,
  postCHATMWithdrawMoney,
  postCHATMDepositMoney,
  postMultiLog,
} = await import('../../../src/controllers/v3/serversControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('serversControllers', () => {
  beforeEach(() => {
    logServerMock.mockReset()
    for (const fn of Object.values(modelMocks)) fn.mockReset()
  })

  const delegatingCases: Array<{
    name: string
    controller: (req: any, res: any) => Promise<any>
    model: keyof typeof modelMocks
    body: any
  }> = [
    { name: 'postIGSettings', controller: postIGSettings, model: 'processPostIGSettings', body: {} },
    { name: 'postStatus', controller: postStatus, model: 'processPostStatus', body: {} },
    { name: 'postDarkRPDropMoney', controller: postDarkRPDropMoney, model: 'processDarkRPDropMoney', body: {} },
    { name: 'postDarkRPPickedUpMoney', controller: postDarkRPPickedUpMoney, model: 'processDarkRPPickedUpMoney', body: {} },
    { name: 'postDarkRPPickedUpCheque', controller: postDarkRPPickedUpCheque, model: 'processDarkRPPickedUpCheque', body: {} },
    { name: 'postCHATMTakeMoney', controller: postCHATMTakeMoney, model: 'processCHATMTakeMoney', body: {} },
    { name: 'postCHATMReceiveMoney', controller: postCHATMReceiveMoney, model: 'processCHATMReceiveMoney', body: {} },
    { name: 'postCHATMSendMoney', controller: postCHATMSendMoney, model: 'processCHATMSendMoney', body: {} },
    { name: 'postCHATMWithdrawMoney', controller: postCHATMWithdrawMoney, model: 'processCHATMWithdrawMoney', body: {} },
    { name: 'postCHATMDepositMoney', controller: postCHATMDepositMoney, model: 'processCHATMDepositMoney', body: {} },
  ]

  for (const { name, controller, model, body } of delegatingCases) {
    it(`${name} delegates to ${model} and forwards the result status/body`, async () => {
      modelMocks[model].mockResolvedValueOnce({ status: 200, body: { success: true } })
      const res = makeRes()

      await controller({ server: { id: 's1' }, body } as any, res)

      expect(modelMocks[model]).toHaveBeenCalledWith({ id: 's1' }, body)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })
  }

  it('getIGSettings responds 200 with the server settings', async () => {
    const server = { getAllIGSettings: vi.fn().mockResolvedValueOnce({ ig_debug: true }) }
    const res = makeRes()
    await getIGSettings({ server } as any, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ settings: { ig_debug: true } })
  })

  it('serverImportWarns delegates with req.body.warns', async () => {
    modelMocks.processServerImportWarns.mockResolvedValueOnce({ status: 200, body: { success: true } })
    const res = makeRes()
    await serverImportWarns({ server: {}, body: { warns: [{ id: 1 }] } } as any, res)
    expect(modelMocks.processServerImportWarns).toHaveBeenCalledWith({}, [{ id: 1 }])
  })

  it('serverStart logs server_start and responds success', async () => {
    const server = {}
    const res = makeRes()
    await serverStart({ server } as any, res)
    expect(logServerMock).toHaveBeenCalledWith(server, 'server_start')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })

  it('serverStop logs server_stop and responds success', async () => {
    const server = {}
    const res = makeRes()
    await serverStop({ server } as any, res)
    expect(logServerMock).toHaveBeenCalledWith(server, 'server_stop')
  })

  it('getInfo responds with req.server', async () => {
    const server = { id: 's1' }
    const res = makeRes()
    await getInfo({ server } as any, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(server)
  })

  it('getPublicToken regenerates and responds with the new token', async () => {
    const server = {
      regeneratePublicTempToken: vi.fn().mockResolvedValueOnce(undefined),
      getPublicToken: () => 'new-token',
    }
    const res = makeRes()
    await getPublicToken({ server } as any, res)
    expect(server.regeneratePublicTempToken).toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ publicTempToken: 'new-token' })
  })

  describe('postMultiLog', () => {
    it('passes the body through when it is an array', async () => {
      modelMocks.processMultiLog.mockResolvedValueOnce({ status: 200, body: { success: true } })
      const res = makeRes()
      await postMultiLog({ server: {}, body: [{ endpoint: '/x', data: {} }] } as any, res)
      expect(modelMocks.processMultiLog).toHaveBeenCalledWith({}, [{ endpoint: '/x', data: {} }])
    })

    it('defaults to an empty array when the body is not an array', async () => {
      modelMocks.processMultiLog.mockResolvedValueOnce({ status: 200, body: { success: true } })
      const res = makeRes()
      await postMultiLog({ server: {}, body: { not: 'an array' } } as any, res)
      expect(modelMocks.processMultiLog).toHaveBeenCalledWith({}, [])
    })
  })
})
