import prisma from '@gmod/infra-prisma'
import { ConfigServer } from '@gmod/config'
import { AdminIDSchema } from '@gmod/schema/admin/AdminDashboardSchema.js'
import { AdminPreviewQuerySchema, AdminServerPreviewsSchema } from '@gmod/schema/admin/AdminServerPreviewsSchema.js'
import { StatusMessagePreviewSchema } from '@gmod/schema/server/StatusMessagePreviewSchema.js'
import { getServerFromID } from '@gmod/domain-server/Server.js'
import { renderStatusPreview } from '../../utils/statusMessagePreview.js'

async function registeredServer(id: unknown) {
  const parsed = AdminIDSchema.safeParse(id)
  if (!parsed.success)
    throw Object.assign(new Error('Invalid server ID.'), {
      name: 'AdminDashboardError',
      status: 400,
      code: 'invalid_request',
    })
  const row = await prisma.gm_server.findFirst({
    where: { id: parsed.data },
    select: { id: true, name: true, guild: true },
  })
  if (!row)
    throw Object.assign(new Error('Server not found.'), { name: 'AdminDashboardError', status: 404, code: 'not_found' })
  return row
}

/** Only stored raster captures served by this API may be embedded in the administration panel. */
export function adminScreenshotURL(raw: string): string | null {
  try {
    const url = new URL(raw)
    const origin = new URL(ConfigServer.domain).origin
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/screenshots\/[a-zA-Z0-9_-]+\.(?:png|jpe?g)$/.test(url.pathname)
    )
      return null
    return url.href
  } catch {
    return null
  }
}

export async function getAdminServerPreviews(id: unknown) {
  const server = await registeredServer(id)
  const screenshots = await prisma.gm_server_screenshots.findMany({
    where: { serverID: server.id },
    take: 6,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, title: true, url: true, createdAt: true },
  })
  return AdminServerPreviewsSchema.parse({
    server: { id: server.id, name: server.name || '', guildID: server.guild },
    screenshots: screenshots.flatMap((row) => {
      const url = adminScreenshotURL(row.url)
      return url
        ? [{ id: row.id, title: (row.title || '').slice(0, 255), url, createdAt: row.createdAt.toISOString() }]
        : []
    }),
    generatedAt: new Date().toISOString(),
  })
}

export async function getAdminServerStatusPreview(id: unknown, query: unknown) {
  const parsed = AdminPreviewQuerySchema.safeParse(query)
  if (!parsed.success)
    throw Object.assign(new Error('Invalid preview language.'), {
      name: 'AdminDashboardError',
      status: 400,
      code: 'invalid_request',
    })
  const server = await registeredServer(id)
  const instance = await getServerFromID(server.id)
  if (!instance)
    throw Object.assign(new Error('Server not found.'), { name: 'AdminDashboardError', status: 404, code: 'not_found' })
  return StatusMessagePreviewSchema.parse(
    await renderStatusPreview(instance, { settings: {}, locale: parsed.data.locale }),
  )
}
