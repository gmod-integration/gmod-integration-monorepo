import { getServerFromID } from '@gmod/domain-server/Server.js'

/** A server identifier supplied by Discord never grants access outside that interaction's community. */
export async function getDiscordCommunityServer(serverID: unknown, guildID: unknown) {
  if (typeof serverID !== 'string' || !serverID || serverID.length > 255 || typeof guildID !== 'string' || !guildID)
    return null
  const server = await getServerFromID(serverID)
  return server?.getGuildID() === guildID ? server : null
}
