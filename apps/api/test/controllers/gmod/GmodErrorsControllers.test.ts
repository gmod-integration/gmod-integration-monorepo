import { describe, expect, it, vi } from 'vitest'

const reportGmodErrorPayloadSafeMock = vi.fn()
vi.mock('@gmod/core/models/gmod/gmodErrorsModels.js', () => ({
  reportGmodErrorPayloadSafe: reportGmodErrorPayloadSafeMock,
}))

const { reportError } = await import('../../../src/controllers/gmod/GmodErrorsControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('reportError', () => {
  it('extracts plain-string serverID/steamID64 params', async () => {
    reportGmodErrorPayloadSafeMock.mockResolvedValueOnce({ status: 200, body: {} })
    const res = makeRes()

    await reportError({ params: { serverID: 's1', steamID64: '765' }, body: { error: 'e' } } as any, res)

    expect(reportGmodErrorPayloadSafeMock).toHaveBeenCalledWith({ error: 'e' }, { serverID: 's1', steamID64: '765' })
  })

  it('extracts the first element of array-valued params', async () => {
    reportGmodErrorPayloadSafeMock.mockResolvedValueOnce({ status: 200, body: {} })
    const res = makeRes()

    await reportError(
      { params: { serverID: ['s1'], steamID64: ['765'] }, body: {} } as any,
      res,
    )

    expect(reportGmodErrorPayloadSafeMock).toHaveBeenCalledWith({}, { serverID: 's1', steamID64: '765' })
  })
})
