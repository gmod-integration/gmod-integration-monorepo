import { z } from 'zod'

export const RewardIDSchema = z.string().uuid()
export const RewardSteamIDSchema = z.string().regex(/^7656119\d{10}$/)
const discordID = z.string().regex(/^\d{15,22}$/)
const date = z.string().datetime({ offset: true })

export const RewardLuaCodeSchema = z
  .string()
  .min(1)
  .max(16_384)
  .refine((value) => value.trim().length > 0 && !value.includes('\0'))

export const RewardActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('darkrp_money'), amount: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ type: z.literal('pointshop_points'), amount: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ type: z.literal('pointshop2_points'), amount: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ type: z.literal('discord_role'), roleID: discordID }).strict(),
  z.object({ type: z.literal('lua'), code: RewardLuaCodeSchema }).strict(),
])
export const RewardTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('verification') }).strict(),
  z
    .object({ type: z.literal('vote'), cooldownSeconds: z.number().int().min(10_800).max(2_592_000).default(10_800) })
    .strict(),
  z.object({ type: z.literal('playtime'), seconds: z.number().int().min(60).max(315_360_000) }).strict(),
  z.object({ type: z.literal('manual') }).strict(),
])
export const RewardRuleInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) =>
        [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
      ),
    description: z.string().trim().max(500).default(''),
    enabled: z.boolean(),
    trigger: RewardTriggerSchema,
    actions: z.array(RewardActionSchema).min(1).max(5),
    pendingDays: z.number().int().min(1).max(30).default(7),
    startsAt: date.nullable().default(null),
    endsAt: date.nullable().default(null),
  })
  .strict()
  .refine((rule) => !rule.startsAt || !rule.endsAt || Date.parse(rule.startsAt) < Date.parse(rule.endsAt), {
    path: ['endsAt'],
    message: 'The end must follow the start.',
  })
export const RewardRuleSchema = z
  .object({
    id: RewardIDSchema,
    revision: z.number().int().positive(),
    name: z.string(),
    description: z.string(),
    enabled: z.boolean(),
    trigger: RewardTriggerSchema,
    actions: z.array(RewardActionSchema),
    pendingDays: z.number().int(),
    startsAt: date.nullable(),
    endsAt: date.nullable(),
    createdAt: date,
    updatedAt: date,
  })
  .strict()
export const RewardRuleSaveSchema = z
  .object({ revision: z.number().int().positive(), rule: RewardRuleInputSchema })
  .strict()
export const RewardRuleDeleteSchema = z.object({ revision: z.number().int().positive() }).strict()
export const RewardStatusSchema = z.enum(['pending', 'delivered', 'failed', 'uncertain', 'expired'])
export const RewardGrantActionSchema = z
  .object({
    id: RewardIDSchema,
    type: z.enum(['darkrp_money', 'pointshop_points', 'pointshop2_points', 'discord_role', 'lua']),
    amount: z.number().int().positive().optional(),
    roleID: discordID.optional(),
    status: RewardStatusSchema,
    reason: z.string().max(64).nullable(),
  })
  .strict()
export const RewardGrantSchema = z
  .object({
    id: RewardIDSchema,
    ruleID: RewardIDSchema,
    ruleName: z.string(),
    steamID64: RewardSteamIDSchema,
    discordID: discordID.nullable(),
    status: RewardStatusSchema,
    actorDiscordID: discordID.nullable(),
    createdAt: date,
    updatedAt: date,
    expiresAt: date,
    reason: z.string().max(500).nullable(),
    actions: z.array(RewardGrantActionSchema).max(5),
  })
  .strict()
export const RewardIntegrationsSchema = z
  .object({ darkrp: z.boolean(), pointshop: z.boolean(), pointshop2: z.boolean() })
  .strict()
export const RewardsDashboardSchema = z
  .object({
    rules: z.array(RewardRuleSchema),
    integrations: RewardIntegrationsSchema.extend({ updatedAt: date }).nullable(),
  })
  .strict()
export const RewardHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine((value) => [25, 50, 250, 500].includes(value))
      .default(25),
    status: RewardStatusSchema.optional(),
    ruleID: RewardIDSchema.optional(),
    steamID64: RewardSteamIDSchema.optional(),
  })
  .strict()
export const RewardHistorySchema = z
  .object({
    items: z.array(RewardGrantSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })
  .strict()
export const RewardSimulationInputSchema = z.object({ steamID64: RewardSteamIDSchema }).strict()
export const RewardSimulationSchema = z
  .object({
    eligible: z.boolean(),
    reason: z.string().max(64).nullable(),
    linked: z.boolean(),
    playedSeconds: z.number().int().nonnegative(),
    requiredSeconds: z.number().int().positive().nullable(),
    alreadyReceived: z.boolean(),
    missingIntegrations: z.array(z.string().max(64)),
  })
  .strict()
export const RewardManualGrantSchema = z
  .object({
    revision: z.number().int().positive(),
    steamID64: RewardSteamIDSchema,
    reason: z.string().trim().min(1).max(500),
    requestID: RewardIDSchema,
  })
  .strict()
const gameAction = z.union([
  RewardActionSchema.options[0].extend({ id: RewardIDSchema }),
  RewardActionSchema.options[1].extend({ id: RewardIDSchema }),
  RewardActionSchema.options[2].extend({ id: RewardIDSchema }),
  RewardActionSchema.options[4].extend({ id: RewardIDSchema }),
])
export const RewardDeliverySchema = z
  .object({
    id: RewardIDSchema,
    token: RewardIDSchema,
    steamID64: RewardSteamIDSchema,
    ruleName: z.string().max(80),
    expiresAt: z.number().int().positive(),
    actions: z.array(gameAction).min(1).max(5),
  })
  .strict()
export const RewardPollSchema = z
  .object({
    integrations: RewardIntegrationsSchema,
    players: z
      .array(RewardSteamIDSchema)
      .max(64)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict()
export const RewardPollResponseSchema = z.object({ deliveries: z.array(RewardDeliverySchema).max(10) }).strict()
export const RewardAckSchema = z
  .object({
    id: RewardIDSchema,
    token: RewardIDSchema,
    results: z
      .array(
        z
          .object({
            id: RewardIDSchema,
            status: z.enum(['pending', 'delivered', 'failed', 'uncertain']),
            reason: z
              .string()
              .regex(/^[a-z_]{1,64}$/)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
  })
  .strict()
// Player-facing descriptions identify Lua rewards without revealing administrator scripts.
export const PlayerRewardActionSchema = z.discriminatedUnion('type', [
  RewardActionSchema.options[0],
  RewardActionSchema.options[1],
  RewardActionSchema.options[2],
  RewardActionSchema.options[3],
  z.object({ type: z.literal('lua') }).strict(),
])
export const PlayerRewardRuleSchema = RewardRuleSchema.extend({ actions: z.array(PlayerRewardActionSchema) })
export const PlayerRewardsSchema = z
  .object({
    rewards: z.array(z.object({ rule: PlayerRewardRuleSchema, simulation: RewardSimulationSchema })),
    history: z.array(RewardGrantSchema),
  })
  .strict()

export type RewardAction = z.infer<typeof RewardActionSchema>
export type RewardRuleInput = z.infer<typeof RewardRuleInputSchema>
export type RewardRule = z.infer<typeof RewardRuleSchema>
export type RewardStatus = z.infer<typeof RewardStatusSchema>
export type RewardGrant = z.infer<typeof RewardGrantSchema>
export type RewardIntegrations = z.infer<typeof RewardIntegrationsSchema>
export type RewardSimulation = z.infer<typeof RewardSimulationSchema>
export type RewardsDashboard = z.infer<typeof RewardsDashboardSchema>
export type RewardHistory = z.infer<typeof RewardHistorySchema>
export type RewardDelivery = z.infer<typeof RewardDeliverySchema>
export type RewardPoll = z.infer<typeof RewardPollSchema>
export type RewardAck = z.infer<typeof RewardAckSchema>
export type PlayerRewards = z.infer<typeof PlayerRewardsSchema>
export type PlayerRewardRule = z.infer<typeof PlayerRewardRuleSchema>
