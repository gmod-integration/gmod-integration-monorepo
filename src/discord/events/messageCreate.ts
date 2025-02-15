import { sendMessageToGmod } from '../../controllers/v3/guildsControllers.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { addAutoRoleToUser, givePremiumRoleOfMainGuild, verifyUser } from '../../models/v3/discordModels.js';
import { Message } from 'discord.js';
import { gmLog } from '../../utils/logger.js';
import { wsSendToServer } from '../../websockets/index.js';

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
    gmLog('info', `Dev command executed by ${user.discordID} '${message.content}'`);

    try {
      switch (action) {
        case 'runWS':
          const serverID = args[0];
          let data = args.slice(1).join(' ');
          data = JSON.parse(data);
          wsSendToServer(serverID, data);
          break;
        case 'checkPremium':
          await givePremiumRoleOfMainGuild();
          break;
        case 'moveMe':
          if (!message.member || !message.member.voice.channel || !message.guild) return;
          const channelID = args[0];
          if (!channelID) return await message.reply({ content: 'No channel ID provided' });
          const channel = message.guild.channels.cache.get(channelID);
          if (!channel || !channel.isVoiceBased())
            return await message.reply({ content: 'Invalid channel ID provided' });
          const member = message.guild.members.cache.get(message.author.id);
          if (channel && member) await member.voice.setChannel(channel);
          break;
        case 'giveMe':
          if (!message.member || !message.guild) return;
          const roleID = args[0];
          if (!roleID) return await message.reply({ content: 'No role ID provided' });
          const role = message.guild.roles.cache.get(roleID);
          if (!role) return await message.reply({ content: 'Invalid role ID provided' });
          await message.member.roles.add(role);
          break;
        case 'deleteMessage':
          const messageID = args[0];
          if (!messageID) return await message.reply({ content: 'No message ID provided' });
          const fetchedMessage = await message.channel.messages.fetch(messageID);
          if (fetchedMessage) fetchedMessage.delete();
          break;
        case 'verifyAll':
          if (!message.guild) return;
          const members = await message.guild.members.fetch();
          for (const member of members.values()) {
            await addAutoRoleToUser(message.guild, member);
            await verifyUser(message.guild, member);
          }
          break;
        case 'test':
          console.log('test', args);
          break;
        default:
          return await message.react('❓');
      }
      await message.react('✅');
    } catch (err) {
      await message.react('❌');
      console.error(err);
    }
  },
};
