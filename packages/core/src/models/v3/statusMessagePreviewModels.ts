import type { Server } from '@gmod/domain-server/Server.js'
import { StatusMessagePreviewInputSchema } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { renderStatusPreview } from '../../utils/statusMessagePreview.js'

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
  try {
    return { status: 200, body: await renderStatusPreview(server, parsed.data) }
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : 'Unable to render the status preview.' },
    }
  }
}
