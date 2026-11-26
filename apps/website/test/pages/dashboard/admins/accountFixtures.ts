import type { AdminGuildRow, AdminUserRow } from '@gmod/schema/admin/AdminDashboardSchema.js'
import { vi } from 'vitest'
import { fetchAPI } from '../../../../src/utils/api.js'
import { acceptAuthSession, resetAuthentication } from '../../../../src/utils/authClient.js'
import { sessionFixture } from '../../../authFixture.js'

export const userRow = (id = '123456789012345678', username = 'Target'): AdminUserRow => ({
  id,
  username,
  rank: 'user',
  steamID64: null,
  activeSessions: 2,
  createdAt: '2026-11-01T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
  lastSeenAt: '2026-11-22T12:00:00.000Z',
})
export const guildRow = (manualPremium = false): AdminGuildRow => ({
  id: '1051881514020917408',
  name: 'Example community',
  language: 'en',
  members: 250,
  serverCount: 3,
  manualPremium,
  gmodstore: false,
  discordPremium: false,
  partner: false,
  createdAt: '2026-11-01T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
})
export function adminIdentity() {
  localStorage.clear()
  resetAuthentication()
  acceptAuthSession(sessionFixture({ user: { ...sessionFixture().user, rank: 'developer' } }))
}
export const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
export function mockDirectory(users: AdminUserRow[] = [userRow()], guilds: AdminGuildRow[] = [guildRow()]) {
  vi.mocked(fetchAPI).mockImplementation(async (endpoint, method) => {
    if (method !== 'GET') return response(endpoint.endsWith('/revoke-sessions') ? { revoked: true } : { updated: true })
    const url = new URL(endpoint, 'http://test.local')
    const source = url.pathname.endsWith('/users') ? users : guilds
    const search = url.searchParams.get('search')?.toLowerCase() || ''
    const rank = url.searchParams.get('rank')
    const rows = source.filter((entry) => {
      const name = 'username' in entry ? entry.username : entry.name
      return `${name} ${entry.id}`.toLowerCase().includes(search) && (!rank || ('rank' in entry && entry.rank === rank))
    })
    const offset = Number(url.searchParams.get('offset') || 0),
      limit = Number(url.searchParams.get('limit') || 25)
    return response({
      items: rows.slice(offset, offset + limit),
      total: rows.length,
      query: { offset, limit, sort: 'createdAt', orderBy: 'DESC', search },
    })
  })
}
