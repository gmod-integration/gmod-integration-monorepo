/** Identity fields used by Discord's API, the dashboard session and avatar proxy. */
export type DiscordAvatarIdentity = {
  id?: string
  discriminator?: string
  avatar?: string | null
  avatarURL?: string
  displayAvatarURL?: string
}

const validID = (id: unknown): id is string => typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id)
const suppliedURL = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Discord uses the legacy discriminator or the migrated account's snowflake for default avatars. */
export function getDiscordDefaultAvatarUrl(user: DiscordAvatarIdentity | undefined): string {
  if (!validID(user?.id)) return ''
  const discriminator = user.discriminator
  const index =
    typeof discriminator === 'string' && /^\d{1,4}$/.test(discriminator) && Number(discriminator) > 0
      ? Number(discriminator) % 5
      : Number((BigInt(user.id) >> 22n) % 6n)
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

/** Prefer the server's display/proxy URL; raw OAuth hashes and defaults support older cached profiles. */
export function getDiscordAvatarUrl(user: DiscordAvatarIdentity | undefined): string {
  const supplied = suppliedURL(user?.displayAvatarURL) || suppliedURL(user?.avatarURL)
  if (supplied) return supplied
  if (validID(user?.id) && typeof user.avatar === 'string' && /^(?:a_)?[a-f\d]{32}$/i.test(user.avatar)) {
    const extension = user.avatar.startsWith('a_') ? 'gif' : 'webp'
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}`
  }
  return getDiscordDefaultAvatarUrl(user)
}
