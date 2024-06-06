import { SlashCommandBuilder } from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { getServerList } from '../../../models/v3/serversModels.js';
import ServerVote from '../../../database/schema/ServerVote.js';
import { secToTime } from '../../utils/index.js';

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

      if (Date.now() - lastVoteTime < voteCooldown) {
        return interaction.reply({
          content: await getTranslate('vote_cooldown', lang, [
            secToTime((voteCooldown - (Date.now() - lastVoteTime)) / 1000),
          ]),
          ephemeral: true,
        });
      }
    }

    await ServerVote.create({
      serverID: server,
      userID: user.id,
    });

    return interaction.reply({
      content: await getTranslate('vote_success', lang),
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
