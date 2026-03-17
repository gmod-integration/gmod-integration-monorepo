import { z } from 'zod'
import { extendZodWithOpenApi } from 'zod-openapi'
import { GmodPlayerSchema } from './GmodPlayerSchema.js'
import { GmodCaptureDataSchema } from './GmodCaptureDataSchema.js'

extendZodWithOpenApi(z)

export const GmodScreenshotSchema = z.object({
  captureData: GmodCaptureDataSchema.openapi({
    description: 'Information about the capture area and format',
  }),
  title: z.string().optional().openapi({
    description: 'Title of the screenshot',
    example: 'My Screenshot',
  }),
  player: GmodPlayerSchema.optional().openapi({
    description: 'Player information associated with the screenshot',
  }),
  screenshot: z.string().openapi({
    description: 'Base64 encoded screenshot image',
  }),
  size: z.string().openapi({
    description: 'Size of the screenshot',
    example: '10KB',
  }),
})

export type GmodScreenshotInput = z.infer<typeof GmodScreenshotSchema>
