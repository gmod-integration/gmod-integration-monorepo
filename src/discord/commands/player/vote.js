import { SlashCommandBuilder } from 'discord.js';
import { getTranslate } from '../../../utils/localizations.ts';
import { getServerList } from '../../../models/v3/serversModels.js';
import ServerVote from '../../../database/schema/ServerVote.js';
import { secToTime } from '../../utils/index.js';
import { getServerFromID } from '../../../classes/v3/Server.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Upvote the visibility of a server in the server list.')
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    ),
  category: 'player',
  async execute(interaction) {
    const server = interaction.options.getString('server');
    const user = interaction.user;
    const lang = interaction.guild.preferredLocale;

    const lastVote = await ServerVote.findOne({
      where: {
        serverID: server,
        userID: user.id,
      },
      order: [['createdAt', 'DESC']],
    });

    if (lastVote) {
      const lastVoteTime = new Date(lastVote.createdAt).getTime();
      const voteCooldown = 1000 * 60 * 60 * 3;

      if (lastVoteTime + voteCooldown > Date.now()) {
        const timeLeft = Math.ceil((lastVoteTime + voteCooldown - Date.now()) / 1000);
        return interaction.reply({
          content: await getTranslate('vote_cooldown', lang, [secToTime(timeLeft)]),
          ephemeral: true,
        });
      }
    }

    await ServerVote.create({
      serverID: server,
      userID: user.id,
    });

    const serverData = await getServerFromID(server);
    const webhooks = await serverData.getVoteChannel();
    if (webhooks && interaction.guild.channels.cache.get(webhooks.channelID)) {
      interaction.guild.channels.cache.get(webhooks.channelID).send({
        content: await getTranslate('vote_webhook', lang, [user.username, serverData.name]),
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: await getTranslate('vote_success', lang, [serverData.name]),
      ephemeral: true,
    });
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices = {};
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
