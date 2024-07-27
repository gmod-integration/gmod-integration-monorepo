import { replyNeedPremium } from '../../classes/v3/Guild.js';
import { verifyUser } from '../../models/v3/discordModels.js';
import { getVerifiedMessageAnswer } from '../utils/messages.js';
import { getPanelUserFromDiscordID } from '../../classes/v3/PanelUser.js';
import { getTranslate } from '../../utils/localizations.js';
import { ButtonVerificationWebsite } from '../utils/buttons.js';
import { ActionRowBuilder } from 'discord.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import gm_guild from '../../database/schema/gm_guild.js';
import {
  getLeaderboardButtons,
  getLeaderboardMessageEmbed,
  getLeaderboardOptions,
  saveLeaderboardOptions,
} from '../../models/v3/leaderboardModels.js';
import { handleWarnButton } from '../../models/v3/warnModels.js';

export default {
  name: 'interactionCreate',
  async execute(interaction) {
    await handleWarnButton(interaction);
    if (!interaction.isButton()) return;
    if (interaction.user.bot) return;

    if (interaction.customId === 'premium') {
      if (!interaction.guild) return;
      return replyNeedPremium(interaction);
    }

    if (interaction.customId.startsWith('leaderboard_')) {
      const lang = interaction.guild.preferredLocale;

      getLeaderboardOptions(interaction.message.id).then((options) => {
        if (!options) {
          interaction.reply({ content: getTranslate('error', lang) });
          return;
        }

        let offset = options.offsetValue;
        let limit = options.limitValue;
        let messageID = options.messageID;

        if (interaction.customId === 'leaderboard_previous') {
          offset = offset - limit;
          if (offset < 0) offset = 0;
        } else if (interaction.customId === 'leaderboard_next') {
          offset = offset + limit;
        } else if (interaction.customId === 'leaderboard_first') {
          offset = 0;
        } else if (interaction.customId === 'leaderboard_last') {
          offset = options.total - limit;
          if (offset < 0) offset = 0;
        }

        getLeaderboardMessageEmbed(options.serverID, options.category, lang, limit, offset).then(
          ({ embed, options }) => {
            interaction.channel.messages.fetch(messageID).then((message) => {
              message
                .edit({
                  embeds: [embed],
                  components: [getLeaderboardButtons(options.page === 1, options.page === options.totalPages)],
                })
                .then(() => {
                  saveLeaderboardOptions(messageID, options).then(() => {
                    interaction.deferUpdate();
                  });
                });
            });
          },
        );
      });
    }

    if (interaction.customId === 'verify') {
      if (!interaction.guild) {
        const panelUser = await getPanelUserFromDiscordID(interaction.user.id);
        const lang = interaction.user.locale;

        if (
          !panelUser ||
          !panelUser.panelToken.creationDate ||
          new Date(panelUser.panelToken.creationDate) < new Date('2024-06-01')
        ) {
          return await interaction.reply({
            content: (await getTranslate('re_verify_yourself', lang)) + '\n _ _',
            components: [new ActionRowBuilder().addComponents(await ButtonVerificationWebsite(lang))],
            ephemeral: true,
          });
        }

        const DBUser = await getUserFromDiscordID(interaction.user.id);
        if (!DBUser || !DBUser.getSteamID64()) {
          return await interaction.reply(await getVerifiedMessageAnswer(false, lang, interaction.user, true));
        }

        const guilds = await panelUser.findGuilds();
        let verifiedOf = [];
        for (const aGuild of guilds) {
          const dbGuild = await gm_guild.findOne({
            where: {
              guild: aGuild.id,
            },
          });
          if (!dbGuild) continue;

          const guild = await interaction.client.guilds.fetch(aGuild.id).catch(() => null);
          if (!guild) continue;

          const user = await guild.members.fetch(interaction.user.id).catch(() => null);
          if (!user) continue;

          const isVerified = await verifyUser(guild, user);
          if (isVerified) verifiedOf.push(guild.name);
        }
        return await interaction.reply(`You have been verified in the following guilds: ${verifiedOf.join(', ')}`);
      } else {
        const guild = await interaction.client.guilds.fetch(interaction.guildId);
        const user = await guild.members.fetch(interaction.user.id).catch(() => null);
        const isVerified = await verifyUser(guild, user);
        return await interaction.reply(
          await getVerifiedMessageAnswer(isVerified, guild.preferredLocale, user, user.id === interaction.user.id),
        );
      }
    }
  },
};
