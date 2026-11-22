import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccountSession, ERASURE_RECEIPT_KEY } from '../../src/utils/accountSession.js'
import {
  acceptAuthSession,
  authSession,
  authStatus,
  LOGOUT_PENDING_KEY,
  resetAuthentication,
} from '../../src/utils/authClient.js'
import { isLogged, isAdmin } from '../../src/utils/event.js'
import { notificationCount, updateNotificationCount } from '../../src/utils/notificationStore.js'
import { sessionFixture } from '../authFixture.js'
const mocks = vi.hoisted(() => ({ current: vi.fn(), socket: vi.fn(), logs: vi.fn(), status: vi.fn() }))
vi.mock('../../src/utils/websocket.js', () => ({
  webSocketSignal: mocks.current,
  setWebSocketSignal: mocks.socket,
  setWebSocketLogsMessages: mocks.logs,
  setWebSocketServerStatus: mocks.status,
}))
let transport: { close: ReturnType<typeof vi.fn>; onmessage: unknown; onclose: unknown; onerror: unknown }
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetAuthentication()
  acceptAuthSession(sessionFixture())
  updateNotificationCount(5)
  transport = { close: vi.fn(), onmessage: vi.fn(), onclose: vi.fn(), onerror: vi.fn() }
  mocks.current.mockReset().mockReturnValue(transport)
  mocks.socket.mockClear()
  mocks.logs.mockClear()
  mocks.status.mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
  resetAuthentication()
  localStorage.clear()
  sessionStorage.clear()
})
const expectCleared = () => {
  expect(authSession()).toBeUndefined()
  expect(authStatus()).toBe('signed_out')
  expect(isLogged()).toBe(false)
  expect(isAdmin()).toBe(false)
  expect(notificationCount()).toBe(0)
  expect(transport.close).toHaveBeenCalledOnce()
  expect(transport.onmessage).toBeNull()
  expect(transport.onclose).toBeNull()
  expect(transport.onerror).toBeNull()
  expect(mocks.socket).toHaveBeenCalledWith(null)
  expect(mocks.logs).toHaveBeenCalledWith([])
  expect(mocks.status).toHaveBeenCalledWith(expect.objectContaining({ serverID: '', isWebSocketConnected: false }))
}
describe('account cleanup with unavailable browser caches', () => {
  it('keeps preferences, recovery receipt and pending logout while removing other cached account data', () => {
    const receipt = { requestId: 'request', receipt: 'receipt-value' }
    localStorage.setItem('locale', 'fr')
    localStorage.setItem('theme', 'dark')
    localStorage.setItem(LOGOUT_PENDING_KEY, 'pending')
    localStorage.setItem('private-cache', 'private')
    sessionStorage.setItem('private', 'private')
    clearAccountSession(receipt)
    expectCleared()
    expect(localStorage.getItem('locale')).toBe('fr')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(localStorage.getItem(LOGOUT_PENDING_KEY)).toBe('pending')
    expect(localStorage.getItem(ERASURE_RECEIPT_KEY)).toBe(JSON.stringify(receipt))
    expect(localStorage.getItem('private-cache')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })
  it('still resets signals and closes the socket when every Storage operation throws', () => {
    for (const method of ['getItem', 'setItem', 'removeItem', 'key', 'clear'] as const)
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('Storage refused')
      })
    expect(() => clearAccountSession({ requestId: 'request', receipt: 'receipt-value' })).not.toThrow()
    expectCleared()
  })
  it('continues cache cleanup after one refused removal and tolerates sessionStorage failure', () => {
    localStorage.setItem('private-first', 'one')
    localStorage.setItem('private-last', 'two')
    const remove = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === 'discordUser') throw new Error('Removal refused')
      return remove.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
      throw new Error('Session storage refused')
    })
    expect(() => clearAccountSession()).not.toThrow()
    expectCleared()
    expect(localStorage.getItem('private-first')).toBeNull()
    expect(localStorage.getItem('private-last')).toBeNull()
  })
})
