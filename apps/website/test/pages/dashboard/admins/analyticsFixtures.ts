import type { AdminAnalytics, AdminAnalyticsDays } from '@gmod/schema/admin/AdminAnalyticsSchema.js'

export const analyticsFixture = (days: AdminAnalyticsDays = 30, empty = false): AdminAnalytics => {
  const end = Date.UTC(2026, 10, 22)
  const start = end - (days - 1) * 86_400_000
  return {
    days,
    timeZone: 'UTC',
    startDate: new Date(start).toISOString().slice(0, 10),
    endDate: '2026-11-22',
    registrations: Array.from({ length: days }, (_, index) => ({
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      communities: !empty && index === 0 ? 3 : 0,
      servers: !empty && index === days - 1 ? 2 : 0,
      accounts: !empty && index === days - 1 ? 8 : 0,
    })),
    generatedAt: '2026-11-22T12:00:00.000Z',
  }
}
