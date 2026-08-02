import { beforeEach, describe, expect, it, vi } from 'vitest'

const gmodErrorsFromMock = vi.fn()
const getErrorsByServerMock = vi.fn()
vi.mock('@gmod/domain-gmod/GmodErrors.js', () => ({
  GmodErrors: { from: gmodErrorsFromMock },
  getErrorsByServer: getErrorsByServerMock,
}))

const {
  InvalidErrorPayloadError,
  InvalidQueryParametersError,
  reportGmodErrorPayload,
  reportGmodErrorPayloadSafe,
  getServerErrorsPayload,
  getServerErrorsPayloadSafe,
} = await import('../../../src/models/gmod/gmodErrorsModels.js')

describe('gmodErrorsModels', () => {
  beforeEach(() => {
    gmodErrorsFromMock.mockReset()
    getErrorsByServerMock.mockReset()
  })

  describe('reportGmodErrorPayload', () => {
    it('parses the payload, saves it, and returns the result', async () => {
      const saveMock = vi.fn().mockResolvedValueOnce({ id: 1 })
      gmodErrorsFromMock.mockReturnValueOnce({ save: saveMock })

      const result = await reportGmodErrorPayload(
        { error: 'boom', stack: ['line1'], id: 'w1', name: 'n', realm: 'server', uptime: 1, count: 1 },
        { serverID: 's1', steamID64: '765' },
      )

      expect(gmodErrorsFromMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'boom', stack: '["line1"]', workshopID: 'w1', serverID: 's1', steamID64: '765' }),
      )
      expect(result).toEqual({ id: 1 })
    })

    it('throws InvalidErrorPayloadError when parsing fails', async () => {
      gmodErrorsFromMock.mockImplementationOnce(() => {
        throw new Error('invalid')
      })

      await expect(reportGmodErrorPayload({}, { serverID: 's1', steamID64: '765' })).rejects.toBeInstanceOf(
        InvalidErrorPayloadError,
      )
    })
  })

  describe('reportGmodErrorPayloadSafe', () => {
    it('returns a 200 with the saved body on success', async () => {
      const saveMock = vi.fn().mockResolvedValueOnce({ id: 1 })
      gmodErrorsFromMock.mockReturnValueOnce({ save: saveMock })

      const result = await reportGmodErrorPayloadSafe({}, { serverID: 's1', steamID64: '765' })

      expect(result).toEqual({ status: 200, body: { id: 1 } })
    })

    it('returns a 400 when the payload is invalid', async () => {
      gmodErrorsFromMock.mockImplementationOnce(() => {
        throw new Error('invalid')
      })

      const result = await reportGmodErrorPayloadSafe({}, { serverID: 's1', steamID64: '765' })

      expect(result).toEqual({ status: 400, body: { error: 'Invalid error data' } })
    })

    it('rethrows an unrelated error', async () => {
      gmodErrorsFromMock.mockReturnValueOnce({ save: vi.fn().mockRejectedValueOnce(new Error('db down')) })

      await expect(reportGmodErrorPayloadSafe({}, { serverID: 's1', steamID64: '765' })).rejects.toThrow('db down')
    })
  })

  describe('getServerErrorsPayload', () => {
    it('parses the query and returns the errors payload', async () => {
      getErrorsByServerMock.mockResolvedValueOnce({ errors: [], query: {} })

      const result = await getServerErrorsPayload({}, 's1')

      expect(result).toEqual({ errors: [], query: {} })
    })

    it('throws InvalidQueryParametersError when the query is invalid', async () => {
      await expect(getServerErrorsPayload({ limit: -1 }, 's1')).rejects.toBeInstanceOf(InvalidQueryParametersError)
    })
  })

  describe('getServerErrorsPayloadSafe', () => {
    it('returns a 200 with the errors payload on success', async () => {
      getErrorsByServerMock.mockResolvedValueOnce({ errors: [], query: {} })

      const result = await getServerErrorsPayloadSafe({}, 's1')

      expect(result).toEqual({ status: 200, body: { errors: [], query: {} } })
    })

    it('returns a 400 when the query is invalid', async () => {
      const result = await getServerErrorsPayloadSafe({ limit: -1 }, 's1')
      expect(result).toEqual({ status: 400, body: { error: 'Invalid query parameters' } })
    })

    it('rethrows an unrelated error', async () => {
      getErrorsByServerMock.mockRejectedValueOnce(new Error('db down'))
      await expect(getServerErrorsPayloadSafe({}, 's1')).rejects.toThrow('db down')
    })
  })
})
