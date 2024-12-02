import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { wsSendToServer } from '../../websockets/index.js';
import { givePremiumRoleOfMainGuild } from '../../models/v3/discordModels.js';
import { Message } from 'discord.js';

const devActions: Record<string, (...args: string[]) => void> = {
  async runWS(serverID: string, rawData: string) {
    // try to convert to JSON
    let data;
    try {
      data = JSON.parse(rawData);
    } catch (err) {
      return console.error('Invalid JSON');
    }
    wsSendToServer(serverID, data);
  },
  async checkPremium() {
    await givePremiumRoleOfMainGuild();
  },
  async test() {
    console.log('test');
  },
};

export default {
  name: 'messageCreate',
  async execute(message: Message) {
    await sendMessageToGmod(message);

    const user = await getUserFromDiscordID(message.author.id);
    if (!user) return;
    if (!user.isDeveloper()) return;
    if (!message.content.startsWith('§')) return;

    const action = message.content.slice(1).split(' ')[0];
    const args = message.content.slice(1).split(' ').slice(1);
    if (!devActions[action]) return;

    try {
      devActions[action](...args);
      return message.reply('Command executed');
    } catch (err) {
      console.error(err);
      return message.reply(`Error executing command ${err}`);
    }
  },
};
