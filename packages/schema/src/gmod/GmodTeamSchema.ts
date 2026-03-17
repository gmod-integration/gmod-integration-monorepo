import { z } from 'zod'
import { extendZodWithOpenApi } from 'zod-openapi'

extendZodWithOpenApi(z)

export const GmodTeamSchema = z
  .object({
    id: z.number().openapi({
      example: 1,
      description: 'ID of the team',
    }),
    name: z.string().openapi({
      example: 'Staff',
      description: 'Name of the team',
    }),
  })
  .openapi({ ref: 'Team' })

export type GmodTeamInput = z.infer<typeof GmodTeamSchema>
