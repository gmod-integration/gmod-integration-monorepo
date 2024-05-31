import { getTranslate } from '../../utils/localizations.js';
import { gmLog } from '../../utils/logger.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ButtonConnect, ButtonDiscordSupport, ButtonVerificationWebsite, ButtonVerify } from './buttons.js';
import { getClient } from '../index.js';
import { getEmojiVersion } from '../../utils/tools.js';
import { discordConfig } from '../../config/index.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { getTrustRank } from './index.js';

export async function getStatusMessage(server, data, buttons, lang) {
  gmLog('status', 'refresh server status message for ' + server.getID());

  let { servOnline, hostname, map, gameMode, players, maxPlayers } = data || {};
  servOnline = !!hostname;
  hostname = hostname === undefined ? await getTranslate('offline', lang) : hostname;
  map = map === undefined ? await getTranslate('offline', lang) : map;
  gameMode = gameMode === undefined ? await getTranslate('offline', lang) : gameMode;
  players = players === undefined ? 0 : players;
  maxPlayers = maxPlayers === undefined ? 0 : maxPlayers;

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

  let rows = [];
  let row1 = new ActionRowBuilder();
  let row2 = new ActionRowBuilder();
  let row3 = new ActionRowBuilder();
  let row4 = new ActionRowBuilder();
  let row5 = new ActionRowBuilder();

  if (servOnline) {
    row1.addComponents(await ButtonConnect(lang, data.ip, data.port));
  }

  const disClient = await getClient();

  function addButtons(button, theRow) {
    let { label, emoji, url } = button;

    if (!label || !emoji) {
      return;
    }

    label = label.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

    // check that emoji is a valid emoji (emoji-version="12.0") or remplace with ?
    const emojiVersion = getEmojiVersion(emoji);
    if (!emojiVersion || emojiVersion > 12) {
      emoji = '❓';
    }

    const theButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(`⠀${label}`)
      .setEmoji(emoji)
      .setURL(`https://gmod-integration.com/open-link?link=${url}`);

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

export async function getVerifiedMessageAnswer(isVerified, guild, member, selfVerify) {
  const lang = guild.preferredLocale;

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
