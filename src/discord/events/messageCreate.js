import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { wsSendToServer } from '../../websockets/index.ts';
import { givePremiumRoleOfMainGuild } from '../../models/v3/discordModels.js';

export default {
  name: 'messageCreate',
  async execute(message) {
    await sendMessageToGmod(message);

    const user = await getUserFromDiscordID(message.author.id);
    if (!user) return;
    if (!user.isDeveloper()) return;
    if (message.content.startsWith('!runWS ')) {
      const [, serverID, msg] = message.content.split(' ');
      if (wsSendToServer(serverID, { message: msg })) {
        message.reply('Message sent to server');
      } else {
        message.reply('Server not found');
      }
    } else if (message.content.startsWith('!checkPremium')) {
      await givePremiumRoleOfMainGuild().then((err) => {
        if (err) {
          message.reply('Error checking premium');
        } else {
          message.reply('Premium checked');
        }
      });
    }
  },
};
