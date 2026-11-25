import { authenticatedFetch } from './authClient.js'
import {
  AccountErasureReceiptSchema,
  AccountErasureRequestIdSchema,
  AccountErasureResponseSchema,
  AccountErasureStatusResponseSchema,
  type AccountErasureStatusResponse,
} from '@gmod/schema/user/AccountErasureSchema.js'
import { getAPIUrl } from './api.js'

import { ERASURE_RECEIPT_KEY, type ErasureReceipt } from './accountSession.js'
export { clearAccountSession, ERASURE_RECEIPT_KEY, type ErasureReceipt } from './accountSession.js'
export type ErasureStatus = AccountErasureStatusResponse

export function readErasureReceipt(): ErasureReceipt | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ERASURE_RECEIPT_KEY) || 'null')
    if (!value || typeof value !== 'object') return
    const requestId = AccountErasureRequestIdSchema.safeParse(Reflect.get(value, 'requestId'))
    const receipt = AccountErasureReceiptSchema.safeParse(Reflect.get(value, 'receipt'))
    if (requestId.success && receipt.success) return { requestId: requestId.data, receipt: receipt.data }
  } catch {
    // An unavailable or malformed local receipt must never be treated as an accepted request.
  }
}

/** Persist the recovery credential before sending a request that revokes the session. */
export function prepareErasureReceipt(): ErasureReceipt {
  const existing = readErasureReceipt()
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const value = {
    requestId: crypto.randomUUID(),
    receipt: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
  }
  localStorage.setItem(ERASURE_RECEIPT_KEY, JSON.stringify(value))
  return value
}

export function forgetErasureReceipt() {
  localStorage.removeItem(ERASURE_RECEIPT_KEY)
}

export async function fetchErasureStatus(value: ErasureReceipt, signal?: AbortSignal): Promise<ErasureStatus> {
  const response = await fetch(
    `${getAPIUrl(false)}/v6/account/erasure-requests/${encodeURIComponent(value.requestId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${value.receipt}` },
      signal,
    },
  )
  if (!response.ok) throw new Error('Erasure status unavailable')
  const status = AccountErasureStatusResponseSchema.parse(await response.json())
  if (status.requestId !== value.requestId) throw new Error('Erasure request mismatch')
  return status
}

export async function requestAccountErasure(value: ErasureReceipt): Promise<ErasureStatus> {
  try {
    const response = await authenticatedFetch(`${getAPIUrl(false)}/v6/account/erasure-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmation: 'DELETE', idempotencyKey: value.requestId, receipt: value.receipt }),
    })
    if (response.status !== 202) throw new Error('Erasure request was not accepted')
    const status = AccountErasureResponseSchema.parse(await response.json())
    if (status.requestId !== value.requestId || status.receipt !== value.receipt)
      throw new Error('Erasure request mismatch')
    return status
  } catch {
    // The server may have accepted the request and revoked sessions before its response was lost.
    return fetchErasureStatus(value)
  }
}
