import { processDiscordMessageToGmod } from '@gmod/core/models/v3/guildsControllerModels.js';
import { Message } from 'discord.js';

export async function sendMessageToGmod(message: Message) {
  return processDiscordMessageToGmod(message);
}
