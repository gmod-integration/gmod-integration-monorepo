import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { getServerList } from '../../../models/v3/serversModels.js';
import { secToTime } from '../../utils/index.js';
import { getServerFromID } from '../../../classes/v3/Server.js';
import prisma from '@gmod/infra-prisma';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Upvote the visibility of a server in the server list.')
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const server = interaction.options.getString('server');
    if (!server) return;

    const user = interaction.user;
    const lang = interaction.guild.preferredLocale;

    const lastVote = await prisma.gm_server_vote.findFirst({
      where: {
        serverID: server,
        userID: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
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

    await prisma.gm_server_vote.create({
      data: {
        serverID: server,
        userID: user.id,
      },
    });

    const serverData = await getServerFromID(server);
    if (!serverData) {
      return interaction.reply({
        content: await getTranslate('server_not_found', lang),
        ephemeral: true,
      });
    }

    const webhooks = await serverData.getVoteChannel();
    if (webhooks) {
      const channel = interaction.guild.channels.cache.get(webhooks.channelID);
      if (webhooks && channel && channel.isTextBased()) {
        channel.send({
          content: await getTranslate('vote_webhook', lang, [user.username, serverData.name]),
        });
      }
    }

    return interaction.reply({
      content: await getTranslate('vote_success', lang, [serverData.name]),
      ephemeral: true,
    });
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices: { [key: string]: string } = {};
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
