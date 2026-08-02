import { describe, expect, it } from 'vitest'
import { QuerySchema } from '../src/db/QuerySchema.js'
import { ServerSchema } from '../src/db/ServerSchema.js'

describe('QuerySchema', () => {
  it('applies defaults when offset/limit are omitted', () => {
    expect(QuerySchema.parse({})).toMatchObject({ offset: 0, limit: 25 })
  })

  it('coerces string offset/limit to numbers', () => {
    expect(QuerySchema.parse({ offset: '5', limit: '10' })).toMatchObject({ offset: 5, limit: 10 })
  })

  it('accepts a fully specified query', () => {
    const full = {
      offset: 10,
      limit: 50,
      sort: 'createdAt',
      orderBy: 'DESC',
      filterField: 'status',
      filterComparator: 'equal',
      filterValue: 'active',
    }
    expect(QuerySchema.parse(full)).toMatchObject(full)
  })

  it('rejects a negative offset', () => {
    expect(QuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('rejects a limit above the maximum of 500', () => {
    expect(QuerySchema.safeParse({ limit: 501 }).success).toBe(false)
  })

  it('rejects an unknown orderBy value', () => {
    expect(QuerySchema.safeParse({ orderBy: 'SIDEWAYS' }).success).toBe(false)
  })

  it('rejects an unknown filterComparator value', () => {
    expect(QuerySchema.safeParse({ filterComparator: 'roughly_equal' }).success).toBe(false)
  })
})

describe('ServerSchema', () => {
  const validServer = {
    token: 'abc123',
    id: 'server-001',
    guild: 'MyGamingGuild',
    name: 'My Awesome Server',
    ip: '127.0.0.1',
    port: '27015',
    image: 'https://example.com/server-image.png',
    verified: true,
    publicTempToken: 'temp-xyz789',
    description: 'This is a great server for gaming and fun!',
    isPublic: true,
  }

  it('parses a valid server record', () => {
    expect(ServerSchema.parse(validServer)).toEqual(validServer)
  })

  it('rejects a server record missing a token', () => {
    const { token: _token, ...rest } = validServer
    expect(ServerSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects a non-boolean verified flag', () => {
    expect(ServerSchema.safeParse({ ...validServer, verified: 'yes' }).success).toBe(false)
  })
})
