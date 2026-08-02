import { describe, expect, it } from 'vitest'
import { Server } from '../../../src/classes/db/Server.js'

const validData = {
  token: 'tok1',
  id: 's1',
  guild: 'g1',
  name: 'My Server',
  ip: '127.0.0.1',
  port: '27015',
  image: '',
  verified: true,
  publicTempToken: 'pub-tok',
  description: 'desc',
  isPublic: true,
}

describe('Server (db class)', () => {
  it('parses a valid server record', () => {
    const server = Server.from(validData)
    expect(server).toMatchObject(validData)
  })

  it('throws when a required field is missing', () => {
    const { token: _token, ...rest } = validData
    expect(() => Server.from(rest)).toThrow()
  })

  it('throws when a field has the wrong type', () => {
    expect(() => Server.from({ ...validData, verified: 'yes' })).toThrow()
  })
})
