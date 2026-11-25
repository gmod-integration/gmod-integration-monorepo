import type { AuthSession } from '../src/utils/authClient.js'
import { normalizeDiscordUserPayload } from '../src/utils/event.js'

export const sessionFixture = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  authenticated: true,
  user: { ...normalizeDiscordUserPayload({ id: 'u1', username: 'bob', globalName: 'Bob' }), rank: 'user' },
  session: {
    id: 'session-current-123',
    expiresAt: '2099-01-01T00:00:00.000Z',
    absoluteExpiresAt: '2099-01-01T00:00:00.000Z',
  },
  csrfToken: 'csrf-token',
  ...overrides,
})
