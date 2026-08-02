import { describe, expect, it } from 'vitest'
import { Query } from '../../../src/classes/db/Query.js'

describe('Query', () => {
  it('applies default offset/limit when omitted', () => {
    const query = Query.from({})
    expect(query.offset).toBe(0)
    expect(query.limit).toBe(25)
  })

  it('parses a fully-populated query', () => {
    const query = Query.from({
      offset: 10,
      limit: 50,
      sort: 'createdAt',
      orderBy: 'DESC',
      filterField: 'status',
      filterComparator: 'equal',
      filterValue: 'active',
    })

    expect(query).toMatchObject({
      offset: 10,
      limit: 50,
      sort: 'createdAt',
      orderBy: 'DESC',
      filterField: 'status',
      filterComparator: 'equal',
      filterValue: 'active',
    })
  })

  it('throws on an invalid limit', () => {
    expect(() => Query.from({ limit: 501 })).toThrow()
  })

  it('throws on an invalid orderBy value', () => {
    expect(() => Query.from({ orderBy: 'sideways' })).toThrow()
  })
})
