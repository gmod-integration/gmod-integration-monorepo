import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { getTranslate } from '../../../utils/localizations.js';
import { getServerList } from '../../../models/v3/serversModels.js';
import gm_server_stat from '../../../database/schema/gm_server_stat.js';
import { getUserFromDiscordID } from '../../../classes/v3/User.js';
import gm_user_steam from '../../../database/schema/gm_user_steam.js';

function secToTime(sec) {
  // convert seconds to ??w ??d ??h ??m ??s
  let time = '';
  const weeks = Math.floor(sec / 604800);
  const days = Math.floor(sec / 86400) % 7;
  const hours = Math.floor(sec / 3600) % 24;
  const minutes = Math.floor(sec / 60) % 60;
  const seconds = sec % 60;

  if (weeks > 0) {
    time += weeks + 'w ';
  }
  if (days > 0) {
    time += days + 'd ';
  }
  if (hours > 0) {
    time += hours + 'h ';
  }
  if (minutes > 0) {
    time += minutes + 'm ';
  }
  if (seconds > 0) {
    time += seconds + 's';
  }

  return time;
}

function moneyFormat(money, currency, separator) {
  // convert money to currency format
  money = money.toString();
  let money_format = '';
  let count = 0;
  for (let i = money.length - 1; i >= 0; i--) {
    if (count == 3) {
      money_format = separator + money_format;
      count = 0;
    }
    money_format = money[i] + money_format;
    count++;
  }
  return currency + money_format;
}

function convertDate(date, format) {
  //use format to convert date to string
  let day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();
  let hour = date.getHours();
  let minute = date.getMinutes();

  // in the format find dd, mm, yyyy, hh, mm and replace with the date
  format = format.replace('dd', day);
  format = format.replace('mm', month);
  format = format.replace('yyyy', year);
  format = format.replace('hh', hour);
  format = format.replace('mm', minute);

  return format;
}

function dateToDiscordTimestamp(date) {
  return '<t:' + Math.floor(date.getTime() / 1000) + ':R>';
}

const customValueFormatList = {
  ['money']: {
    ['format']: (value) => {
      return moneyFormat(value, '$', ',');
    },
    ['emoji']: '💰',
  },
};

function customValueFormat(key, value) {
  if (customValueFormatList[key]) {
    return customValueFormatList[key].format(value);
  } else {
    return value;
  }
}

async function customValueFormatTitle(key, lang) {
  if (customValueFormatList[key]) {
    return customValueFormatList[key].emoji + '⠀' + (await getTranslate(key, lang));
  } else {
    return key;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('stat')
    .setDescription("Show your stats or another user's stats for a specific server.")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription("The server's stat you want to see")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's stat you want to see").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('steamid').setDescription("The steam id of the user's stat you want to see").setRequired(false),
    ),
  category: 'player',
  async execute(interaction) {
    console.log('stat command');
    const user = interaction.options.getUser('user') || interaction.user;
    const lang = interaction.guild.preferredLocale;
    const server = interaction.options.getString('server');
    const steamid = interaction.options.getString('steamid');

    let steamID64ToUse;
    if (!steamid) {
      const dbUser = await getUserFromDiscordID(user.id);
      if (!dbUser) {
        return interaction.reply({ content: await getTranslate('user_not_linked', lang), ephemeral: true });
      }
      steamID64ToUse = dbUser.steamID64;
    }

    if (server === 'global') {
      const userData = await gm_user_steam.findOne({
        where: {
          steam_id: steamID64ToUse,
        },
      });

      if (!userData) {
        return interaction.reply({ content: await getTranslate('user_not_found', lang), ephemeral: true });
      }

      const embed = {
        color: 0x2b2d31,
        title: await getTranslate('stat_of_global', lang, [userData.username || userData.steam_id]),
        fields: [
          {
            name: await getTranslate('total_time', lang),
            value: userData.total_time ? secToTime(userData.total_time) : '0',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: await getTranslate('total_kills', lang),
            value: userData.total_kill ? userData.total_kill : '0',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: await getTranslate('total_deaths', lang),
            value: userData.total_death ? userData.total_death : '0',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: await getTranslate('last_join', lang),
            value: userData.last_connect ? dateToDiscordTimestamp(userData.last_connect) : 'Never',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: await getTranslate('total_join', lang),
            value: userData.total_connect ? userData.total_connect : '0',
            inline: true,
          },
        ],
      };

      return interaction.reply({ embeds: [embed] });
    } else {
      const userData = await gm_server_stat.findOne({
        where: {
          steam_id: steamID64ToUse,
          server_id: server,
        },
      });

      if (!userData) {
        return interaction.reply({ content: await getTranslate('user_or_server_not_found', lang), ephemeral: true });
      }

      const embed = {
        color: 0x2b2d31,
        title: await getTranslate('stat_of_server', lang, [userData.username || userData.steam_id, server]),
        fields: [
          {
            name: '🪪⠀' + (await getTranslate('name', lang)),
            value: userData.name ? userData.name : 'Unknown',
            inline: true,
          },
          {
            name: '',
            value: '',
            inline: true,
          },
          {
            name: '🛠️⠀' + (await getTranslate('rank', lang)),
            value: userData.rank ? userData.rank : 'Unknown',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: '📅⠀' + (await getTranslate('first_join', lang)),
            value: userData.first_join ? dateToDiscordTimestamp(userData.first_join) : 'Never',
            inline: true,
          },
          {
            name: '',
            value: '',
            inline: true,
          },
          {
            name: '📅⠀' + (await getTranslate('last_join', lang)),
            value: userData.last_connect ? dateToDiscordTimestamp(userData.last_connect) : 'Never',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: '🔪⠀' + (await getTranslate('total_kills', lang)),
            value: userData.total_kill ? userData.total_kill : '0',
            inline: true,
          },
          {
            name: '',
            value: '',
            inline: true,
          },
          {
            name: '💀⠀' + (await getTranslate('total_deaths', lang)),
            value: userData.total_death ? userData.total_death : '0',
            inline: true,
          },
          {
            name: '',
            value: '',
          },
          {
            name: '⏳⠀' + (await getTranslate('total_time', lang)),
            value: userData.total_time ? secToTime(userData.total_time) : '0',
            inline: true,
          },
          {
            name: '',
            value: '',
            inline: true,
          },
          {
            name: '🗓️⠀' + (await getTranslate('total_join', lang)),
            value: userData.total_connect ? userData.total_connect : '0',
            inline: true,
          },
        ],
      };

      if (userData.custom_values) {
        let acID = 1;
        for (const [key, value] of Object.entries(JSON.parse(userData.custom_values))) {
          embed.fields.push({
            name: await customValueFormatTitle(key, lang),
            value: await customValueFormat(key, value),
            inline: true,
          });

          acID++;

          if (acID % 2 === 0) {
            embed.fields.push({
              name: '',
              value: '',
              inline: true,
            });
          }

          if (acID % 3 === 0) {
            embed.fields.push({
              name: '',
              value: '',
            });
          }
        }
      }

      return interaction.reply({ embeds: [embed] });
    }
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices = {
      // [await getTranslate('global_stat', interaction.guild.preferredLocale)]: 'global',
    };
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
