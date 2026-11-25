import { z } from 'zod'

const text = z.string().max(255)
const supportURL = text.refine(
  (value) =>
    value === '' ||
    (() => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol)
      } catch {
        return false
      }
    })(),
  'Enter an HTTP or HTTPS URL.',
)
export const ServerDashboardSettingsSchema = z
  .object({
    ig_syncBan: z.boolean(),
    ig_syncTimeout: z.boolean(),
    ig_syncKick: z.boolean(),
    ig_filterOnBan: z.boolean(),
    ig_redownloadMaterials: z.boolean(),
    ig_debug: z.boolean(),
    ig_forcePlayerLink: z.boolean(),
    ig_verifyOnJoin: z.boolean(),
    ig_verifyOnReadyKickTime: z.number().int().min(0).max(2_147_483_647),
    ig_verifyFamilySharing: z.boolean(),
    ig_clientBranch: z.enum(['none', 'dev', 'prerelease', 'x86-64', 'any']),
    ig_supportLink: supportURL,
    ig_maintenance: z.boolean(),
    maintenance_whitelist_role: z.union([z.literal(''), z.string().regex(/^\d{17,20}$/)]),
    ig_language: z.enum(['en', 'fr', 'de', 'es', 'it', 'tr', 'ru']),
    ig_logTimestamp: text,
    ig_adminRank: z
      .record(z.string().trim().min(1).max(64), z.literal(true))
      .refine((value) => Object.keys(value).length > 0, 'At least one administrator rank is required.'),
    sync_role_direction: z.enum(['both', 'gmod-to-discord', 'discord-to-gmod']),
    sync_pseudo_direction: z.enum(['disable', 'both', 'gmod-to-discord', 'discord-to-gmod']),
    pseudoFormat: text,
    syncChatDirection: z.enum(['both', 'gmodToDiscord', 'discordToGmod']),
    chat_sync_relay_all: z.boolean(),
    sync_chat_prevent_ping: z.boolean(),
    log_hide_ip: z.boolean(),
    log_include_file: z.boolean(),
  })
  .partial()
  .strict()
  .refine((settings) => Object.keys(settings).length > 0, 'At least one setting is required.')
  .refine(
    (settings) =>
      Object.values(settings).every(
        (value) => (typeof value === 'object' ? JSON.stringify(value) : String(value)).length <= 255,
      ),
    'A setting exceeds its storage limit.',
  )
export const GuildDashboardSettingsSchema = z
  .object({
    verification_dont_mp: z.boolean(),
    verification_dont_join_support: z.boolean(),
  })
  .partial()
  .strict()
  .refine((settings) => Object.keys(settings).length > 0, 'At least one setting is required.')
export const ServerDashboardSettingsRequestSchema = z.object({ settings: ServerDashboardSettingsSchema }).strict()
export const GuildDashboardSettingsRequestSchema = z.object({ settings: GuildDashboardSettingsSchema }).strict()
