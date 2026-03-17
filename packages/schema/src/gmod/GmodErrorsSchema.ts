import { z } from 'zod'
import { extendZodWithOpenApi } from 'zod-openapi'

extendZodWithOpenApi(z)

export const GmodErrorsSchema = z
  .object({
    error: z.string().openapi({
      example: 'attempt to index a nil value',
      description: 'The error message from the server',
    }),
    stack: z.string().openapi({
      example: "stack traceback:\n\t[C]: in function 'GetPlayerName'\n\t...",
      description: 'The stack trace of the error',
    }),
    name: z.string().optional().openapi({
      example: 'example_workshop',
      description: 'The name of the workshop item related to the error, if applicable',
    }),
    realm: z.enum(['client', 'server']).openapi({
      example: 'server',
      description: 'The realm where the error occurred, either "client" or "server"',
    }),
    uptime: z.number().openapi({
      example: 3600,
      description: 'The server uptime in seconds when the error occurred',
    }),
    count: z.number().openapi({
      example: 1,
      description: 'The number of times this error has occurred',
    }),
    serverID: z.string().openapi({
      example: 'server_123',
      description: 'The ID of the server where the error occurred',
    }),
    steamID64: z.string().optional().openapi({
      example: '76561198012345678',
      description: 'The Steam ID of the player involved in the error, if applicable',
    }),
    workshopID: z.string().optional().openapi({
      example: '1234567890',
      description: 'The workshop ID related to the error, if applicable',
    }),
  })
  .openapi({ ref: 'Errors' })

export type GmodErrorsInput = z.infer<typeof GmodErrorsSchema>
