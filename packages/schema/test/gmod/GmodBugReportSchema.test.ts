import { describe, expect, it } from 'vitest'
import {
  GmodBugReportAcknowledgementSchema,
  GmodBugReportAttachmentSchema,
} from '../../src/gmod/GmodBugReportSchema.js'

const capture = {
  screenshot: 'YWJjZA==',
  captureData: { w: 1920, h: 1080, x: 0, y: 0, quality: 95, format: 'jpeg' },
  size: '1KB',
}

describe('optional bug report capture', () => {
  it('accepts bounded capture metadata and refuses incomplete or malformed attachments', () => {
    expect(GmodBugReportAttachmentSchema.safeParse(capture).success).toBe(true)
    for (const value of [
      undefined,
      null,
      [],
      {},
      { screenshot: 'YWJjZA==' },
      { ...capture, size: undefined },
      { ...capture, captureData: { ...capture.captureData, quality: Infinity } },
      { ...capture, captureData: { ...capture.captureData, w: 0 } },
      { ...capture, captureData: { ...capture.captureData, format: 'html' } },
    ]) {
      expect(GmodBugReportAttachmentSchema.safeParse(value).success).toBe(false)
    }
  })

  it.each(['none', 'saved', 'failed'])(
    'acknowledges a saved report with only its %s attachment outcome',
    (attachment) => {
      expect(GmodBugReportAcknowledgementSchema.parse({ success: true, saved: true, attachment })).toEqual({
        success: true,
        saved: true,
        attachment,
      })
      expect(
        GmodBugReportAcknowledgementSchema.safeParse({ success: true, saved: true, attachment, description: 'private' })
          .success,
      ).toBe(false)
    },
  )

  it('refuses false report success and arbitrary error metadata', () => {
    for (const value of [
      { success: true, saved: false, attachment: 'failed' },
      { success: true, saved: true, attachment: 'private exception details' },
      { success: true, saved: true, attachment: 'failed', error: 'private storage credentials' },
    ]) {
      expect(GmodBugReportAcknowledgementSchema.safeParse(value).success).toBe(false)
    }
  })
})
