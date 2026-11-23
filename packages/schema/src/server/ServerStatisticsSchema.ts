import { z } from 'zod'

export const ServerStatisticsPeriodSchema = z.enum(['24h', '7d', '30d', 'custom'])
const instant = z.string().datetime({ offset: true })
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const measured = z.number().finite().nonnegative()

export const ServerStatisticsQuerySchema = z
  .object({
    period: ServerStatisticsPeriodSchema.default('7d'),
    from: instant.optional(),
    to: instant.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.period !== 'custom') {
      if (value.from !== undefined || value.to !== undefined)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['period'], message: 'Dates require a custom period.' })
      return
    }
    if (!value.from || !value.to) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'Both custom dates are required.' })
      return
    }
    const duration = Date.parse(value.to) - Date.parse(value.from)
    if (duration <= 0 || duration > 90 * 86_400_000)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Choose an increasing period of at most 90 days.',
      })
  })

export const ServerStatisticsSessionDurationKeySchema = z.enum(['under15m', '15to60m', '1to3h', 'over3h'])
export const ServerStatisticsResponseSchema = z
  .object({
    period: z
      .object({ from: instant, to: instant, bucket: z.enum(['hour', 'day']), timeZone: z.literal('UTC') })
      .strict(),
    summary: z
      .object({
        registeredPlayers: count,
        newPlayers: count,
        peakPlayers: count.nullable(),
        averagePlayers: measured.nullable(),
        completedSessions: count,
        playedSeconds: count,
        medianSessionSeconds: measured.nullable(),
        activePlayers: count,
      })
      .strict(),
    population: z
      .array(z.object({ at: instant, average: measured.nullable(), peak: count.nullable(), samples: count }).strict())
      .max(96),
    activity: z
      .array(z.object({ at: instant, newPlayers: count, sessions: count, playedSeconds: count }).strict())
      .max(96),
    heatmap: z
      .array(
        z
          .object({
            day: z.number().int().min(0).max(6),
            hour: z.number().int().min(0).max(23),
            average: measured.nullable(),
            samples: count,
          })
          .strict(),
      )
      .length(168),
    sessionDurations: z.array(z.object({ key: ServerStatisticsSessionDurationKeySchema, count }).strict()).length(4),
    topPlayers: z
      .array(z.object({ steamID64: z.string(), name: z.string(), playedSeconds: count, sessions: count }).strict())
      .max(10),
    live: z
      .object({
        updatedAt: instant.nullable(),
        online: z.boolean(),
        players: count,
        maxPlayers: count,
        branches: z.array(z.object({ name: z.string().min(1).max(32), count }).strict()),
      })
      .strict(),
  })
  .strict()

export type ServerStatisticsQuery = z.infer<typeof ServerStatisticsQuerySchema>
export type ServerStatisticsResponse = z.infer<typeof ServerStatisticsResponseSchema>
