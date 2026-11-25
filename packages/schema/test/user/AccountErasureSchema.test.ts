import { describe, expect, it } from 'vitest'
import {
  AccountErasureRequestSchema,
  AccountErasureResponseSchema,
  AccountErasureStatusResponseSchema,
} from '../../src/user/AccountErasureSchema.js'

const id = 'c6801874-4d4b-4543-884c-80f379fe7299'
const receipt = 'a'.repeat(64)
const body = { confirmation: 'DELETE', idempotencyKey: id, receipt }
const pending = { requestId: id, status: 'pending', requestedAt: '2026-11-21T12:00:00.000Z', completedAt: null }

describe('account erasure contract', () => {
  it('requires explicit confirmation and pre-generated recovery identifiers without accepting a target account', () => {
    expect(AccountErasureRequestSchema.parse(body)).toEqual(body)
    for (const input of [
      {},
      { ...body, confirmation: 'delete' },
      { ...body, confirmation: true },
      { ...body, idempotencyKey: 'user-1' },
      { ...body, receipt: undefined },
      { ...body, receipt: 'not-a-secret-receipt' },
      { ...body, receipt: 'a'.repeat(65) },
      { ...body, discordID: 'another-user' },
      { ...body, status: 'completed' },
    ]) {
      expect(AccountErasureRequestSchema.safeParse(input).success).toBe(false)
    }
  })

  it('accepts only durable job states and ISO timestamps', () => {
    for (const status of ['pending', 'running', 'retry', 'completed']) {
      expect(AccountErasureStatusResponseSchema.safeParse({ ...pending, status }).success).toBe(true)
    }
    for (const input of [
      { ...pending, status: 'failed' },
      { ...pending, requestedAt: 'yesterday' },
      { ...pending, completedAt: 'tomorrow' },
      { ...pending, requestId: 'invalid' },
    ]) {
      expect(AccountErasureStatusResponseSchema.safeParse(input).success).toBe(false)
    }
  })

  it('separates the POST receipt from the public follow-up status and strips internal fields', () => {
    const internal = { ...pending, receipt, discordID: 'user-1', token: 'private-token' }
    expect(AccountErasureStatusResponseSchema.parse(internal)).toEqual(pending)
    expect(AccountErasureResponseSchema.parse(internal)).toEqual({ ...pending, receipt })
    expect(AccountErasureResponseSchema.safeParse(pending).success).toBe(false)
  })
})
