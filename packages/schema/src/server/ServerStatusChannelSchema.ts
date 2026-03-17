import { z } from 'zod'
import { extendZodWithOpenApi } from 'zod-openapi'
extendZodWithOpenApi(z)

export const ServerStatusChannelSchema = z
  .object({
    id: z.string().openapi({
      example: '123e4567-e89b-12d3-a456-426614174000',
      description: 'ID of the status channel configuration',
    }),
    serverID: z.string().openapi({
      example: '123e4567-e89b-12d3-a456-426614174000',
      description: 'ID of the server this status channel belongs to',
    }),
    channelID: z.string().openapi({
      example: '123456789012345678',
      description: 'Discord channel ID where the status will be posted',
    }),
    format: z.string().openapi({
      example: '%s players',
      description: 'Format of the status message, %s will be replaced with the number of players',
    }),
    createdAt: z.string().openapi({
      example: '2024-01-01T00:00:00.000Z',
      description: 'Timestamp when the status channel configuration was created',
    }),
    updatedAt: z.string().openapi({
      example: '2024-01-01T00:00:00.000Z',
      description: 'Timestamp when the status channel configuration was last updated',
    }),
  })
  .openapi({ ref: 'Server Status Channel' })

export type ServerStatusChannelInput = z.infer<typeof ServerStatusChannelSchema>
