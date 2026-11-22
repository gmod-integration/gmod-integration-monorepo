import { describe, expect, it, vi } from 'vitest'

const uploadScreenshotPayloadMock = vi.fn()
const reportBugPayloadMock = vi.fn()
vi.mock('@gmod/core/models/v3/clientsModels.js', () => ({
  uploadScreenshotPayload: uploadScreenshotPayloadMock,
  reportBugPayload: reportBugPayloadMock,
}))

const { uploadScreenshot, reportBugs } = await import('../../../src/controllers/v3/clientsControllers.js')

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('clientsControllers', () => {
  describe('uploadScreenshot', () => {
    it('responds 400 on an error result', async () => {
      uploadScreenshotPayloadMock.mockResolvedValueOnce({ error: 'missing_arguments' })
      const res = makeRes()
      await uploadScreenshot({ server: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('responds 200 on success', async () => {
      uploadScreenshotPayloadMock.mockResolvedValueOnce({ success: true })
      const res = makeRes()
      await uploadScreenshot({ server: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe('reportBugs', () => {
    it('responds 400 on an error result', async () => {
      reportBugPayloadMock.mockResolvedValueOnce({ error: 'missing_arguments' })
      const res = makeRes()
      await reportBugs({ server: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('responds 200 on success', async () => {
      reportBugPayloadMock.mockResolvedValueOnce({ id: 1 })
      const res = makeRes()
      await reportBugs({ server: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('keeps a saved report successful while returning the failed attachment outcome', async () => {
      const result = { success: true, saved: true, attachment: 'failed' }
      reportBugPayloadMock.mockResolvedValueOnce(result)
      const res = makeRes()
      await reportBugs({ server: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledExactlyOnceWith(result)
    })

    it('does not acknowledge a report that privacy controls prevented from being saved', async () => {
      reportBugPayloadMock.mockResolvedValueOnce({ skip: true, message: 'Personal data collection is disabled' })
      const res = makeRes()
      await reportBugs({ server: {}, body: {} } as any, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledExactlyOnceWith({ error: 'personal_data_collection_disabled' })
    })
  })
})
