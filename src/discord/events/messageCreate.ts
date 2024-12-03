import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { givePremiumRoleOfMainGuild } from '../../models/v3/discordModels.js';
import { Message } from 'discord.js';
import { gmLog } from '../../utils/logger.js';
import { wsSendToServer } from '../../websockets/index.js';

const devActions: Record<string, (...args: string[]) => Promise<void>> = {
  async runWS(...args: string[]) {
    const serverID = args[0];
    let data = args.slice(1).join(' ');
    data = JSON.parse(data);
    wsSendToServer(serverID, data);
  },
  async checkPremium() {
    await givePremiumRoleOfMainGuild();
  },
  async test(...args: string[]) {
    console.log('test', args);
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
    if (!devActions[action]) return message.reply('Command not found');
    gmLog('info', `Dev command executed by ${user.discordID} '${message.content}'`);

    try {
      await devActions[action](...args);
      return message.reply({
        content: 'Command executed',
      });
    } catch (err) {
      console.error(err);
      return message.reply({
        content: `Error executing command ${err}`,
      });
    }
  },
};
