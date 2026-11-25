import { z } from 'zod'

export const DashboardAccessDenialReasonSchema = z.enum([
  'discord_admin_required',
  'steam_link_required',
  'game_admin_required',
  'scope_unavailable',
])

/** Explain the missing requirement without exposing identities, ranks or server configuration. */
export const DashboardAccessDenialSchema = z
  .object({ allowed: z.literal(false), reason: DashboardAccessDenialReasonSchema })
  .strict()

export type DashboardAccessDenialReason = z.infer<typeof DashboardAccessDenialReasonSchema>
export type DashboardAccessDenial = z.infer<typeof DashboardAccessDenialSchema>
