import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { ButtonVerificationWebsite } from '../../utils/buttons.js';
import { getTrustRank } from '../../utils/index.js';
import { getUserFromDiscordID } from '../../../classes/v3/User.js';
import { getTranslate } from '../../../utils/localizations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Display your profile or another user's profile.")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's profile you want to display").setRequired(false),
    ),
  category: 'player',
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const lang = interaction.guild.preferredLocale;
    const gm_user = await getUserFromDiscordID(user.id);

    const embed = {
      color: 0x2b2d31,
      title: await getTranslate('profile_info', lang),
      thumbnail: {
        url: user.displayAvatarURL({ dynamic: true }),
      },
      fields: [
        {
          name: '🪪⠀' + (await getTranslate('username', lang)),
          value: '<@' + user.id + '> / ' + user.username,
          inline: true,
        },
        {
          name: '',
          value: '',
          inline: true,
        },
        {
          name: '🛠️⠀' + (await getTranslate('bot_rank', lang)),
          value: await getTranslate(gm_user.rank || 'user', lang),
          inline: true,
        },
        {
          name: '',
          value: '\n',
        },
        {
          name: '🛡️⠀' + (await getTranslate('trust_rank', lang)),
          value: await getTrustRank(gm_user.trustLevel || 50, lang),
          inline: true,
        },
        {
          name: '',
          value: '',
          inline: true,
        },
        {
          name: '⌚⠀' + (await getTranslate('last_verification', lang)),
          value: gm_user.lastVerification
            ? '<t:' + Math.floor(gm_user.lastVerification.getTime() / 1000) + ':R>'
            : await getTranslate('never', lang),
          inline: true,
        },
        {
          name: '',
          value: '\n',
        },
        {
          name: '🪪⠀' + (await getTranslate('discord_id', lang)),
          value: user.id,
          inline: true,
        },
        {
          name: '',
          value: '',
          inline: true,
        },
        {
          name: '🪪⠀' + (await getTranslate('steam_id', lang)),
          value: gm_user.steamID64 ? gm_user.steamID64 : await getTranslate('not_verified', lang),
          inline: true,
        },
      ],
    };

    const open_verify = await ButtonVerificationWebsite(lang);
    const open_steam = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('⠀' + (await getTranslate('steam_profile', lang)))
      .setEmoji('🔗')
      .setURL(`https://steamcommunity.com/profiles/${gm_user.steam}`);

    const row = new ActionRowBuilder();
    row.addComponents(open_verify);

    if (gm_user.steamID64) {
      row.addComponents(open_steam);
    }

    console.log('embed', embed);

    return interaction.reply({ embeds: [embed], components: [row] });
  },
};
