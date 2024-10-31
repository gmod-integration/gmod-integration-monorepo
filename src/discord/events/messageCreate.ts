import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { wsSendToServer } from '../../websockets/index.js';
import { givePremiumRoleOfMainGuild } from '../../models/v3/discordModels.js';
import { Message } from 'discord.js';

export default {
  name: 'messageCreate',
  async execute(message: Message) {
    await sendMessageToGmod(message);

    const user = await getUserFromDiscordID(message.author.id);
    if (!user) return;
    if (!user.isDeveloper()) return;

    try {
      if (message.content.startsWith('§run websocket ')) {
        const [, serverID, msg] = message.content.split(' ');
        wsSendToServer(serverID, { message: msg });
      } else if (message.content.startsWith('!checkPremium')) {
        await givePremiumRoleOfMainGuild();
      }

      return message.reply('Command executed');
    } catch (err) {
      console.error(err);
      return message.reply('Error executing command');
    }
  },
};
