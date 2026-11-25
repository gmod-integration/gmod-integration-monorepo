import type { Server } from '@gmod/domain-server/Server.js'
import {
  enqueueDiscordServerStatusPreview,
  isBullMQReplyTimeoutError,
} from '@gmod/infra-bullmq/discordQueueAdapters.js'
import { StatusMessagePreviewInputSchema } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { resolveGuildAccess, effectiveServerSetting, limitResources } from '@gmod/domain-access/index.js'

/** Validate a draft without saving settings or publishing any Discord message. */
export async function processPreviewServerStatus(server: Server, input: unknown) {
  const parsed = StatusMessagePreviewInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'Invalid status preview',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    }
  }
  const access = await resolveGuildAccess(server.guild)
  if (parsed.data.settings.show_status_chart !== undefined)
    parsed.data.settings.show_status_chart = effectiveServerSetting(
      access,
      'show_status_chart',
      parsed.data.settings.show_status_chart,
    )
  if (parsed.data.buttons) parsed.data.buttons = limitResources(access, 'status.buttons', parsed.data.buttons)
  try {
    return { status: 200, body: await enqueueDiscordServerStatusPreview(server.id, parsed.data, 15000) }
  } catch (error) {
    if (isBullMQReplyTimeoutError(error)) {
      return { status: 503, body: { error: 'The Discord preview is temporarily unavailable. Please try again.' } }
    }
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : 'Unable to render the status preview.' },
    }
  }
}
