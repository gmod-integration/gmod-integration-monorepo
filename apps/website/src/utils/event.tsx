import { createSignal } from 'solid-js'
import { getDiscordAvatarUrl } from './discordAvatar.js'

export type DiscordUserState = {
  id: string
  username: string
  globalName: string
  displayName: string
  discriminator: string
  avatarURL: string
  displayAvatarURL: string
}

export function normalizeDiscordUserPayload(payload: unknown): DiscordUserState {
  const field = (key: string): string => {
    if (!payload || typeof payload !== 'object') return ''
    const value: unknown = Reflect.get(payload, key)
    return typeof value === 'string' ? value : ''
  }
  const avatarURL = getDiscordAvatarUrl({
    id: field('id'),
    discriminator: field('discriminator'),
    avatar: field('avatar'),
    avatarURL: field('avatarURL'),
    displayAvatarURL: field('displayAvatarURL'),
  })
  const globalName = field('globalName') || field('global_name')
  const displayName = globalName || field('displayName') || field('username')

  return {
    id: field('id'),
    username: field('username'),
    globalName: globalName || displayName,
    displayName: field('displayName') || displayName,
    discriminator: field('discriminator'),
    avatarURL: field('avatarURL') || avatarURL,
    displayAvatarURL: field('displayAvatarURL') || avatarURL,
  }
}

export const [isLogged, setIsLogged] = createSignal(false)

export const [discordUser, setDiscordUser] = createSignal<DiscordUserState>(normalizeDiscordUserPayload({}))

export const [isAdmin, setIsAdmin] = createSignal(false)
