import { z } from 'zod'

/** HTTP projections only. Internal webhook credentials stay in the domain/worker records. */
export const DashboardChannelConfigurationSchema = z.object({
  channelID: z.string().max(255).optional(),
  adminCmd: z.boolean().optional(),
})
export const ReportChannelRequestSchema = z.object({ channelID: z.string().regex(/^\d{17,20}$/) }).strict()
export const LuaErrorChannelRequestSchema = ReportChannelRequestSchema
export const DashboardChatConfigurationSchema = z.object({
  channel: z.string().max(255).optional(),
})
export type DashboardChannelConfiguration = z.infer<typeof DashboardChannelConfigurationSchema>
export type DashboardChatConfiguration = z.infer<typeof DashboardChatConfigurationSchema>
