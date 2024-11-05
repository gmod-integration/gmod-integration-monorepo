import { REST } from 'discord.js';
import { discordConfig } from '../config/index.js';

const cmdToRemove = ['1230296259160444971'];

const rest = new REST().setToken(discordConfig.botToken!);
try {
  console.log('[INFO] Started removing application commands.');

  for (const cmd of cmdToRemove) {
    await rest.delete(`/applications/${discordConfig.clientID}/commands/${cmd}`);
    console.log(`[INFO] Removed command ${cmd}`);
  }
} catch (error) {
  console.error('[ERROR] Failed to remove application commands.');
  console.error(error);
}
