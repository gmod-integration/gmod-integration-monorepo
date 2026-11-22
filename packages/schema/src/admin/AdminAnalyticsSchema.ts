import { z } from 'zod'

const DAY_MS = 86_400_000
export const AdminAnalyticsDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)])
export type AdminAnalyticsDays = z.infer<typeof AdminAnalyticsDaysSchema>
export const AdminAnalyticsQuerySchema = z
  .object({
    days: z.preprocess(
      (value) => (typeof value === 'string' && /^(7|30|90)$/.test(value) ? Number(value) : value),
      AdminAnalyticsDaysSchema.default(30),
    ),
  })
  .strict()

const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const at = Date.parse(`${value}T00:00:00.000Z`)
    return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value
  }, 'Invalid UTC calendar date.')
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const AdminDailyRegistrationsSchema = z
  .object({ date: utcDate, communities: count, servers: count, accounts: count })
  .strict()
export type AdminDailyRegistrations = z.infer<typeof AdminDailyRegistrationsSchema>
export const AdminAnalyticsSchema = z
  .object({
    days: AdminAnalyticsDaysSchema,
    timeZone: z.literal('UTC'),
    startDate: utcDate,
    endDate: utcDate,
    registrations: z.array(AdminDailyRegistrationsSchema).min(7).max(90),
    generatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    const start = Date.parse(`${value.startDate}T00:00:00.000Z`)
    if (!Number.isFinite(start)) return
    if (
      value.registrations.length !== value.days ||
      value.endDate !== value.generatedAt.slice(0, 10) ||
      value.registrations.some(
        (point, index) => point.date !== new Date(start + index * DAY_MS).toISOString().slice(0, 10),
      ) ||
      value.registrations.at(-1)?.date !== value.endDate
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected one ordered UTC bucket for every selected day.',
      })
  })
export type AdminAnalytics = z.infer<typeof AdminAnalyticsSchema>
