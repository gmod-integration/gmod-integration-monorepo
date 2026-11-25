import { z } from 'zod'

const name = z.string().trim().min(1).max(255)
const url = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  })
export const DashboardLinkSchema = z.object({ alias: name, url, active: z.boolean() }).strict()
export const DashboardRoleSchema = z.object({ userGroup: name, enable: z.boolean() }).strict()
export const DashboardTeamSchema = z.object({ teamName: name, enable: z.boolean() }).strict()
export const DashboardPseudoSchema = z
  .object({ role: name, name: z.string().max(255), prefix: z.string().max(255), enabled: z.boolean() })
  .strict()
export const DashboardChatFilterSchema = z
  .object({
    element: z.enum(['message', 'teamName', 'userGroup', 'steamID64']),
    operator: z.enum(['contain', 'notContain', 'equal', 'notEqual', 'startWith', 'endWith']),
    trigger: z
      .string()
      .max(255)
      .refine((value) => value.trim().length > 0),
    action: z.enum(['block', 'relay', 'anonymize']),
    active: z.boolean(),
  })
  .strict()
export const DashboardVerificationRoleSchema = z.object({ isGiveRole: z.boolean(), enabled: z.boolean() }).strict()
