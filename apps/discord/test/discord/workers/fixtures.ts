import { vi } from 'vitest'

/**
 * Minimal stand-in for discord.js's Collection: only the methods the source file under test
 * (discordQueueWorkers.ts) actually calls (filter/map/some/first, plus the native Map API).
 */
export class FakeCollection<K, V> extends Map<K, V> {
  filter(fn: (value: V, key: K) => boolean): FakeCollection<K, V> {
    const result = new FakeCollection<K, V>()
    for (const [k, v] of this) if (fn(v, k)) result.set(k, v)
    return result
  }
  map<T>(fn: (value: V, key: K) => T): T[] {
    return Array.from(this.entries(), ([k, v]) => fn(v, k))
  }
  some(fn: (value: V, key: K) => boolean): boolean {
    for (const [k, v] of this) if (fn(v, k)) return true
    return false
  }
  first(): V | undefined {
    return this.values().next().value
  }
}

export function makeJob(name: string, data: Record<string, unknown>, id = 'job-1') {
  return { id, name, data } as any
}

export function makeRole(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name: `role-${id}`,
    position: 1,
    color: 0,
    managed: false,
    editable: true,
    comparePositionTo: vi.fn().mockReturnValue(1),
    members: new FakeCollection<string, any>(),
    ...overrides,
  }
}

export function makeMember(id: string, overrides: Record<string, any> = {}) {
  const { rolesCache, highest, hasPermission, user, ...rest } = overrides
  return {
    id,
    user: {
      id,
      tag: `user-${id}#0001`,
      bot: false,
      displayAvatarURL: vi.fn().mockReturnValue(`https://cdn.example/${id}.png`),
      setUsername: vi.fn().mockResolvedValue(undefined),
      setAvatar: vi.fn().mockResolvedValue(undefined),
      avatarURL: vi.fn().mockReturnValue(null),
      ...user,
    },
    displayName: `Member ${id}`,
    permissions: { has: vi.fn().mockReturnValue(hasPermission ?? false) },
    roles: {
      highest: highest ?? makeRole(`${id}-highest`),
      cache: rolesCache ?? new FakeCollection<string, any>(),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    setNickname: vi.fn().mockResolvedValue(undefined),
    ...rest,
  }
}

export function makeChannel(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name: `channel-${id}`,
    type: 0,
    position: 0,
    parent: null,
    isSendable: vi.fn().mockReturnValue(true),
    isTextBased: vi.fn().mockReturnValue(true),
    send: vi.fn().mockResolvedValue({ id: 'msg-1', attachments: { first: vi.fn().mockReturnValue(undefined) } }),
    messages: { fetch: vi.fn().mockResolvedValue(null) },
    ...overrides,
  }
}

export function makeGuild(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name: `guild-${id}`,
    ownerId: 'owner-1',
    preferredLocale: 'en-US',
    iconURL: vi.fn().mockReturnValue('https://cdn.example/icon.png'),
    channels: { cache: new FakeCollection<string, any>(), fetch: vi.fn().mockResolvedValue(new FakeCollection()) },
    roles: { cache: new FakeCollection<string, any>(), fetch: vi.fn().mockResolvedValue(new FakeCollection()) },
    emojis: { cache: new FakeCollection<string, any>(), fetch: vi.fn().mockResolvedValue(new FakeCollection()) },
    members: {
      cache: new FakeCollection<string, any>(),
      fetch: vi.fn().mockResolvedValue(null),
    },
    bans: { fetch: vi.fn().mockResolvedValue(null) },
    ...overrides,
  }
}

export function makeGuildClient(guild: any) {
  return {
    guilds: {
      fetch: vi.fn().mockResolvedValue(guild),
      cache: { get: vi.fn().mockReturnValue(guild), has: vi.fn().mockReturnValue(!!guild) },
    },
    user: { id: 'bot-1', username: 'Bot', avatarURL: vi.fn().mockReturnValue(null) },
  }
}
