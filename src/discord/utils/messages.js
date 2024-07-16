import { getTranslate } from '../../utils/localizations.js';
import { gmLog } from '../../utils/logger.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ButtonConnect, ButtonDiscordSupport, ButtonVerificationWebsite, ButtonVerify } from './buttons.js';
import { getEmojiVersion } from '../../utils/tools.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { dateToDiscordTimestamp, getTrustRank, secToTime } from './index.js';
import gm_server from '../../database/schema/gm_server.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import gm_user_steam from '../../database/schema/gm_user_steam.js';

export async function getStatusMessage(server, data, lang) {
  gmLog('status', 'refresh server status message for ' + server.getID());

  const buttons = await server.getServerStatusButtons();

  let { servOnline, hostname, map, gameMode, players, maxPlayers, ip, port, playersList } = data || {};
  servOnline = !!hostname;
  hostname = hostname === undefined ? await getTranslate('offline', lang) : hostname;
  map = map === undefined ? await getTranslate('offline', lang) : map;
  gameMode = gameMode === undefined ? await getTranslate('offline', lang) : gameMode;
  players = players === undefined ? 0 : players;
  maxPlayers = maxPlayers === undefined ? 0 : maxPlayers;
  ip = ip === undefined ? '' : ip;
  port = port === undefined ? '' : port;
  playersList = playersList === undefined ? [] : playersList;

  const embed = {
    color: 0x2b2d31,
    title: await getTranslate('status_of', lang, [server.getName() || server.getID()]),
    fields: [
      {
        name: '💾⠀' + (await getTranslate('name', lang)),
        value: hostname,
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '📡⠀' + (await getTranslate('status', lang)),
        value: servOnline ? await getTranslate('online', lang) : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '',
        inline: true,
      },
      {
        name: '👤⠀' + (await getTranslate('players', lang)),
        value: servOnline ? players + '/' + maxPlayers : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '🗺️⠀' + (await getTranslate('map', lang)),
        value: map,
        inline: true,
      },
      {
        name: '',
        value: '',
        inline: true,
      },
      {
        name: '🛻⠀' + (await getTranslate('gamemode', lang)),
        value: gameMode,
        inline: true,
      },
    ],
    timestamp: new Date(),
  };

  if (servOnline && playersList.length > 0 && (await server.getSetting('show_player_list_status'))) {
    playersList.sort((a, b) => {
      return b.connectTime - a.connectTime;
    });

    const playersListString = playersList.map((player) => {
      // return `${dateToDiscordTimestamp(new Date(new Date() - player.connectTime * 1000))} - ${player.userGroup} - ${player.name}`;
      return `${secToTime(player.connectTime)} - ${player.name}`;
    });

    embed.fields.push(
      {
        name: '',
        value: '\n',
      },
      {
        name: '👤⠀' + (await getTranslate('player_list', lang)),
        value: playersListString.join('\n'),
      },
    );
  }

  let rows = [];
  let row1 = new ActionRowBuilder();
  let row2 = new ActionRowBuilder();
  let row3 = new ActionRowBuilder();
  let row4 = new ActionRowBuilder();
  let row5 = new ActionRowBuilder();

  if (servOnline) {
    row1.addComponents(await ButtonConnect(lang, ip, port));
  }

  function addButtons(button, theRow) {
    let { name, emoji, url } = button;

    if (!name || !emoji) {
      return;
    }

    name = name.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

    // check that emoji is a valid emoji (emoji-version="12.0") or remplace with ?
    const emojiVersion = getEmojiVersion(emoji);
    if (!emojiVersion || emojiVersion > 12) {
      emoji = '❓';
    }

    const theButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(`⠀${name}`)
      .setEmoji(emoji)
      .setURL(`${serverConfig.websiteUrl}/open?link=${encodeURIComponent(url)}`);

    // Ajouter le bouton à la ligne
    theRow.addComponents(theButton);
  }

  buttons.forEach((button) => {
    if (row1.components.length < 5) {
      addButtons(button, row1);
    } else if (row2.components.length < 5) {
      addButtons(button, row2);
    } else if (row3.components.length < 5) {
      addButtons(button, row3);
    } else if (row4.components.length < 5) {
      addButtons(button, row4);
    } else if (row5.components.length < 5) {
      addButtons(button, row5);
    }
  });

  if (row1.components.length > 0) rows.push(row1);
  if (row2.components.length > 0) rows.push(row2);
  if (row3.components.length > 0) rows.push(row3);
  if (row4.components.length > 0) rows.push(row4);
  if (row5.components.length > 0) rows.push(row5);

  return { embeds: [embed], components: rows };
}

export async function getNotVerifiedMessage(guild, member) {
  const lang = guild.preferredLocale;

  const embed = {
    color: 0x2b2d31,
    title: await getTranslate('hello', lang, [member.globalName]),
    fields: [
      {
        name: await getTranslate('join_msg_p1_name', lang),
        value: await getTranslate('join_msg_p1_value', lang),
        inline: false,
      },
      {
        name: '',
        value: '\n',
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p2_name', lang),
        value: await getTranslate('join_msg_p2_value', lang, [
          `[Garry's Mod Integration](${discordConfig.oauthPanel}&state=redirect:/account)`,
        ]),
        inline: false,
      },
      {
        name: '',
        value: '\n',
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p3_name', lang),
        value: await getTranslate('join_msg_p3_value', lang),
        inline: false,
      },
      {
        name: '',
        value: '\n',
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p4_name', lang),
        value: await getTranslate('join_msg_p4_value', lang),
        inline: false,
      },
    ],
  };

  const open_verify = await ButtonVerificationWebsite(lang);
  const manual_verify = await ButtonVerify(lang);
  const our_discord = await ButtonDiscordSupport(lang);

  const row = new ActionRowBuilder().addComponents(open_verify, manual_verify, our_discord);

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function getVerifiedMessageAnswer(isVerified, lang, member, selfVerify) {
  const row = new ActionRowBuilder().addComponents(await ButtonVerificationWebsite(lang));

  if (isVerified) {
    if (selfVerify) {
      return {
        content: await getTranslate('user_verified_self', lang),
        ephemeral: true,
      };
    } else {
      return {
        content: await getTranslate('user_verified', lang, [`<@${member.id}>`]),
        ephemeral: true,
      };
    }
  } else {
    if (selfVerify) {
      return {
        content: (await getTranslate('user_not_verified_self', lang, ['/verify'])) + '\n_ _',
        ephemeral: true,
        components: [row],
      };
    } else {
      return {
        content: (await getTranslate('user_not_verified', lang, [`<@${member.id}>`, '/verify'])) + '\n_ _',
        ephemeral: true,
        components: [row],
      };
    }
  }
}

export async function getVerificationGuildMessage(lang) {
  const embed = {
    color: 0x2b2d31,
    title: await getTranslate('welcome_on_our_server', lang),
    fields: [
      {
        name: await getTranslate('setup_msg_p1_name', lang),
        value: await getTranslate('setup_msg_p1_value', lang),
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: await getTranslate('setup_msg_p2_name', lang),
        value: await getTranslate('setup_msg_p2_value', lang),
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: await getTranslate('setup_msg_p3_name', lang),
        value: await getTranslate('setup_msg_p3_value', lang),
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: await getTranslate('setup_msg_p4_name', lang),
        value: await getTranslate('setup_msg_p4_value', lang, ['https://gmod-integration.com/legal/privacy']),
      },
    ],
  };

  const open_verify = await ButtonVerificationWebsite(lang);
  const manual_verify = await ButtonVerify(lang);
  const our_discord = await ButtonDiscordSupport(lang);

  const row = new ActionRowBuilder().addComponents(open_verify, manual_verify, our_discord);

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function getProfileMessage(guild, user) {
  const lang = guild.preferredLocale;
  let gm_user = await getUserFromDiscordID(user.id);
  if (!gm_user) {
    gm_user = {};
    gm_user.rank = 'user';
    gm_user.trustLevel = 50;
  }

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
        value: await getTranslate(gm_user.rank, lang),
        inline: true,
      },
      {
        name: '',
        value: '\n',
      },
      {
        name: '🛡️⠀' + (await getTranslate('trust_rank', lang)),
        value: await getTrustRank(gm_user.trustLevel, lang),
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

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function getUserStatisticMessage(user, server, guild, steamid) {
  const lang = guild.preferredLocale;

  const customValueFormatList = {
    money: {
      format: (value) => {
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      },
      emoji: '💰',
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

  let steamID64ToUse;
  if (!steamid) {
    const dbUser = await getUserFromDiscordID(user.id);
    if (!dbUser) {
      return { content: await getTranslate('user_not_linked', lang), ephemeral: true };
    }
    steamID64ToUse = dbUser.steamID64;
  } else {
    steamID64ToUse = steamid;
  }

  if (server === 'global') {
    const userData = await gm_user_steam.findOne({
      where: {
        steam_id: steamID64ToUse,
      },
    });

    if (!userData) {
      return { content: await getTranslate('user_not_found', lang), ephemeral: true };
    }

    const embed = {
      color: 0x2b2d31,
      title: await getTranslate('stat_of_global', lang, [userData.username || userData.steam_id]),
      fields: [
        // steam_id, username, last_connect, total_time, total_death, total_kill, total_connect
        {
          name: '🪪⠀' + (await getTranslate('username', lang)),
          value: userData.username ? userData.username : 'Unknown',
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
        {
          name: '',
          value: '',
        },
        {
          name: '📅⠀' + (await getTranslate('last_join', lang)),
          value: userData.last_connect ? dateToDiscordTimestamp(userData.last_connect) : 'Never',
          inline: true,
        },
      ],
    };

    return { embeds: [embed] };
  } else {
    const serverDB = await gm_server.findOne({
      where: {
        id: server,
      },
    });

    if (!serverDB) {
      return { content: await getTranslate('server_not_found', lang), ephemeral: true };
    }

    const userData = await gm_server_stat.findOne({
      where: {
        steam_id: steamID64ToUse,
        server_id: server,
      },
    });

    if (!userData) {
      return { content: await getTranslate('user_or_server_not_found', lang), ephemeral: true };
    }

    const embed = {
      color: 0x2b2d31,
      title: await getTranslate('stat_of_server', lang, [userData.name || userData.steam_id]),
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
        {
          name: '',
          value: '',
        },
      ],
      footer: {
        text: `SteamID: ${userData.steam_id} - Server: ${serverDB.name}`,
      },
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

    return { embeds: [embed] };
  }
}
