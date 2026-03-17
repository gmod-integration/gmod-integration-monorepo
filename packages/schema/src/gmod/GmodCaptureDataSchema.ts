import { z } from 'zod'
import { extendZodWithOpenApi } from 'zod-openapi'

extendZodWithOpenApi(z)

export const GmodCaptureDataSchema = z.object({
  w: z.number().openapi({
    description: 'Width of the capture area',
    example: 1920,
  }),
  h: z.number().openapi({
    description: 'Height of the capture area',
    example: 1080,
  }),
  x: z.number().openapi({
    description: 'X coordinate of the capture area',
    example: 0,
  }),
  y: z.number().openapi({
    description: 'Y coordinate of the capture area',
    example: 0,
  }),
  quality: z.number().openapi({
    description: 'Quality of the screenshot (0-100)',
    example: 80,
  }),
  format: z.enum(['jpeg', 'png']).openapi({
    description: 'Format of the screenshot',
    example: 'jpeg',
  }),
})

export type GmodCaptureDataInput = z.infer<typeof GmodCaptureDataSchema>
