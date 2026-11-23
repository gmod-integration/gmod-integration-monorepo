import type { AdminGuildRow, AdminOverview, AdminServerRow } from '@gmod/schema/admin/AdminDashboardSchema.js'

export const guildFixture = (changes: Partial<AdminGuildRow> = {}): AdminGuildRow => ({
  id: '1051881514020917408',
  name: 'Example community',
  language: 'en',
  members: 100,
  serverCount: 2,
  manualPremium: false,
  gmodstore: false,
  partner: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...changes,
})
export const serverFixture = (changes: Partial<AdminServerRow> = {}): AdminServerRow => ({
  id: 'server-1',
  guildID: '1051881514020917408',
  guildName: 'Example community',
  name: 'Example server',
  verified: false,
  isPublic: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  addonVersion: '5.2.8',
  lastSeenAt: '2026-11-22T12:00:00.000Z',
  recentlyActive: true,
  ...changes,
})
export const overviewFixture = (changes: Partial<AdminOverview> = {}): AdminOverview => ({
  totals: {
    guilds: 120,
    servers: 45,
    discordUsers: 700,
    linkedUsers: 600,
    steamProfiles: 500,
    discordMemberships: 900,
    activeSessions: 24,
    manualPremium: 15,
    gmodstorePremium: 10,
  },
  recent: { days: 7, guilds: 12, servers: 9, users: 80 },
  languages: [
    { language: 'en', count: 80 },
    { language: 'fr', count: 40 },
  ],
  generatedAt: '2026-11-22T12:00:00.000Z',
  ...changes,
})
export function pageFixture<T>(endpoint: string, items: T[], total = items.length) {
  const parameters = new URL(endpoint, 'http://local.test').searchParams
  return {
    items,
    total,
    query: {
      limit: Number(parameters.get('limit') || 25),
      offset: Number(parameters.get('offset') || 0),
      sort: parameters.get('sort') || 'createdAt',
      orderBy: parameters.get('orderBy') || 'DESC',
      search: parameters.get('search') || '',
    },
  }
}
export const ok = (body: unknown) => ({ ok: true, json: async () => body })
export const failed = () => ({ ok: false, json: async () => ({ error: 'failed' }) })
