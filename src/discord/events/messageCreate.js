import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { wsSendToServer } from '../../websockets/index.js';

export default {
  name: 'messageCreate',
  async execute(message) {
    await sendMessageToGmod(message);

    if (message.guildId) return;
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
    }
  },
};
