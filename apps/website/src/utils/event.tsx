import { createSignal } from 'solid-js'

export type DiscordUserState = {
  id: string
  username: string
  globalName: string
  displayName: string
  discriminator: string
  avatarURL: string
  displayAvatarURL: string
}

export function normalizeDiscordUserPayload(payload: any): DiscordUserState {
  const avatarURL = payload?.displayAvatarURL || payload?.avatarURL || ''
  const displayName = payload?.globalName || payload?.displayName || payload?.username || ''

  return {
    id: payload?.id || '',
    username: payload?.username || '',
    globalName: payload?.globalName || displayName,
    displayName: payload?.displayName || displayName,
    discriminator: payload?.discriminator || '',
    avatarURL: payload?.avatarURL || avatarURL,
    displayAvatarURL: payload?.displayAvatarURL || avatarURL,
  }
}

export const [isLogged, setIsLogged] = createSignal(false)

export const [discordUser, setDiscordUser] = createSignal<DiscordUserState>(
  normalizeDiscordUserPayload({}),
)

export const [isAdmin, setIsAdmin] = createSignal(false)
