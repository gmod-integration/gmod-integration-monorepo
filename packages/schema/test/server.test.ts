import { describe, expect, it } from 'vitest'
import { ServerStatusChannelSchema } from '../src/server/ServerStatusChannelSchema.js'

describe('ServerStatusChannelSchema', () => {
  const validRecord = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    serverID: '123e4567-e89b-12d3-a456-426614174000',
    channelID: '123456789012345678',
    format: '%s players',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }

  it('parses a valid status channel record', () => {
    expect(ServerStatusChannelSchema.parse(validRecord)).toEqual(validRecord)
  })

  it('rejects a record missing the channelID', () => {
    const { channelID: _channelID, ...rest } = validRecord
    expect(ServerStatusChannelSchema.safeParse(rest).success).toBe(false)
  })
})
