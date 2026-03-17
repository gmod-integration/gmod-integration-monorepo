import { type Server } from './Server.js';

type GuildClientResolver = (guildID: string, forcePresenceOnGuild?: boolean) => Promise<any>;
type StatusMessageBuilder = (server: Server, data: any, lang: string) => Promise<any>;

let guildClientResolver: GuildClientResolver | null = null;
let statusMessageBuilder: StatusMessageBuilder | null = null;

export function setDiscordGuildClientResolver(resolver: GuildClientResolver) {
  guildClientResolver = resolver;
}

export function setDiscordStatusMessageBuilder(builder: StatusMessageBuilder) {
  statusMessageBuilder = builder;
}

export async function resolveDiscordGuildClient(guildID: string, forcePresenceOnGuild = true) {
  if (!guildClientResolver) {
    throw new Error('Discord guild client resolver is not configured');
  }

  return await guildClientResolver(guildID, forcePresenceOnGuild);
}

export async function buildDiscordStatusMessage(server: Server, data: any, lang: string) {
  if (!statusMessageBuilder) {
    throw new Error('Discord status message builder is not configured');
  }

  return await statusMessageBuilder(server, data, lang);
}
