import { describe, expect, it } from 'vitest'
import {
  AdminConnectionsQuerySchema,
  AdminErrorsQuerySchema,
  AdminBugsQuerySchema,
  AdminConnectionsSchema,
  AdminConnectionRowSchema,
  AdminErrorsSchema,
  AdminBugsSchema,
} from '../../src/admin/AdminMonitoringSchema.js'

const time = '2026-11-23T00:00:00.000Z'
const incident = {
  id: 'a'.repeat(64),
  summary: 'Example',
  reports: 1,
  serverCount: 1,
  firstSeenAt: time,
  lastSeenAt: time,
}

describe('administration monitoring contracts', () => {
  it('defaults bounded pagination and normalizes numeric and boolean query strings', () => {
    expect(AdminConnectionsQuerySchema.parse({})).toEqual({
      offset: 0,
      limit: 25,
      search: '',
      sort: 'createdAt',
      orderBy: 'DESC',
    })
    expect(
      AdminErrorsQuerySchema.parse({ days: '30', recurringOnly: 'true', offset: '25', limit: '50', search: ' error ' }),
    ).toMatchObject({ days: 30, recurringOnly: true, offset: 25, limit: 50, search: 'error' })
    expect(AdminErrorsQuerySchema.parse({ days: 90, recurringOnly: false })).toMatchObject({
      days: 90,
      recurringOnly: false,
    })
    expect(AdminBugsQuerySchema.parse({ recurringOnly: 'false' })).toMatchObject({
      days: 7,
      state: 'open',
      recurringOnly: false,
    })
  })

  it('rejects ambiguous pagination, invalid booleans and filters from another resource', () => {
    for (const changes of [
      { offset: '-1' },
      { offset: '10000001' },
      { limit: ['25'] },
      { limit: '1000' },
      { sort: 'token' },
    ])
      expect(AdminConnectionsQuerySchema.safeParse(changes).success).toBe(false)
    expect(AdminErrorsQuerySchema.safeParse({ recurringOnly: '1' }).success).toBe(false)
    expect(AdminErrorsQuerySchema.safeParse({ days: 365 }).success).toBe(false)
    expect(AdminBugsQuerySchema.safeParse({ guildID: 'unscoped' }).success).toBe(false)
  })

  it('preserves unavailable socket presence as unknown and refuses credentials in responses', () => {
    const response = {
      items: [
        { id: 's1', name: 'Server', guildID: 'g1', guildName: 'Guild', activeSockets: null, leaseExpiresAt: null },
      ],
      total: 1,
      query: {},
      presence: 'unavailable',
      observedAt: null,
      leaseTtlSeconds: 90,
      generatedAt: time,
    }
    expect(AdminConnectionsSchema.safeParse(response).success).toBe(true)
    expect(AdminConnectionsSchema.safeParse({ ...response, token: 'secret' }).success).toBe(false)
    expect(AdminConnectionsSchema.safeParse({ ...response, total: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false)
  })

  it('accepts bounded incident projections while rejecting raw data and invalid counts', () => {
    const error = { ...incident, realm: 'server', occurrences: 4 }
    expect(
      AdminErrorsSchema.safeParse({ items: [error], total: 1, query: {}, since: time, generatedAt: time }).success,
    ).toBe(true)
    const bugs = { items: [incident], total: 1, query: {}, since: time, generatedAt: time }
    expect(AdminBugsSchema.safeParse(bugs).success).toBe(true)
    expect(AdminBugsSchema.safeParse({ ...bugs, items: [{ ...incident, reports: -1 }] }).success).toBe(false)
    expect(AdminBugsSchema.safeParse({ ...bugs, items: [{ ...incident, steamID64: 'private' }] }).success).toBe(false)
  })

  it('keeps unreported addon metadata unknown and validates measured rates and wire protocols', () => {
    const row = { id: 's1', name: 'Server', guildID: 'g1', guildName: 'Guild', activeSockets: 1, leaseExpiresAt: time }
    expect(AdminConnectionRowSchema.parse(row)).toMatchObject({
      addonVersion: null,
      protocol: null,
      requestsPerMinute: null,
      lastSeenAt: null,
    })
    expect(
      AdminConnectionRowSchema.safeParse({
        ...row,
        addonVersion: 'v5.2.8',
        protocol: 'legacy',
        requestsPerMinute: 10,
        httpRequestsPerMinute: 10,
        websocketRequestsPerMinute: 0,
        lastSeenAt: time,
      }).success,
    ).toBe(true)
    for (const metadata of [
      { addonVersion: 'private token' },
      { requestsPerMinute: -1 },
      { websocketRequestsPerMinute: 1.5 },
      { protocol: 'probably-modern' },
      { lastSeenAt: 'invalid' },
      { token: 'secret' },
    ])
      expect(AdminConnectionRowSchema.safeParse({ ...row, ...metadata }).success).toBe(false)
  })
})
