import { getTranslate } from '../../utils/localizations.js';
import { gmLog } from '../../utils/logger.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, GuildMember, User } from 'discord.js';
import { ButtonConnect, ButtonDiscordSupport, ButtonVerificationWebsite, ButtonVerify } from './buttons.js';
import { getEmojiVersion } from '../../utils/tools.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getUserFromDiscordID } from '../../classes/v3/User.js';
import { dateToDiscordTimestamp, getTrustRank, secToTime } from './index.js';
import { Server } from '../../classes/v3/Server.js';
import { PlayerGmod } from '../../classes/v3/PlayerGmod.js';
import prisma from '../../prisma.js';

export function getEmptyEmbedBuilderField(lineBreak: number = 1) {
  let emptyField = '';
  for (let i = 0; i < lineBreak; i++) {
    emptyField += '\n \u200b';
  }
  return emptyField;
}

export async function getStatusMessage(server: Server, data: any, lang: string) {
  gmLog('status', 'refresh server status message for ' + server.getID());

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

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(await getTranslate('status_of', lang, [server.getName() || server.getID()]))
    .addFields(
      {
        name: '💾⠀' + (await getTranslate('name', lang)),
        value: hostname,
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '📡⠀' + (await getTranslate('status', lang)),
        value: servOnline ? await getTranslate('online', lang) : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '👤⠀' + (await getTranslate('players', lang)),
        value: servOnline ? players + '/' + maxPlayers : await getTranslate('offline', lang),
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '🗺️⠀' + (await getTranslate('map', lang)),
        value: map,
        inline: true,
      },
      {
        name: '🛻⠀' + (await getTranslate('gamemode', lang)),
        value: gameMode,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  if (servOnline && playersList.length > 0 && (await server.getSetting('show_player_list_status'))) {
    playersList.sort((a: any, b: any) => {
      return b.connectTime - a.connectTime;
    });

    const playersListString = playersList.map((player: PlayerGmod) => {
      return `${secToTime(player.connectTime)} - ${player.name}`;
    });

    embed.addFields(
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
      },
      {
        name: '👤⠀' + (await getTranslate('player_list', lang)),
        value: playersListString.join('\n'),
      },
    );
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const row1 = new ActionRowBuilder<ButtonBuilder>();
  const row2 = new ActionRowBuilder<ButtonBuilder>();
  const row3 = new ActionRowBuilder<ButtonBuilder>();
  const row4 = new ActionRowBuilder<ButtonBuilder>();
  const row5 = new ActionRowBuilder<ButtonBuilder>();

  if (servOnline) {
    row1.addComponents(await ButtonConnect(lang, ip, port));
  }

  const buttons = await server.getServerStatusButtons();

  function addButtons(
    button: {
      name: string;
      emoji: string;
      url: string;
    },
    theRow: ActionRowBuilder<ButtonBuilder>,
  ) {
    let { name, emoji, url } = button;

    if (!name || !emoji) {
      return;
    }

    name = name.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

    const emojiVersion = getEmojiVersion(emoji);
    if (!emojiVersion || Number(emojiVersion) > 12) {
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

  return {
    embeds: [embed],
    components: rows,
  };
}

export async function getNotVerifiedMessage(guild: Guild, member: GuildMember) {
  const lang = guild.preferredLocale;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(await getTranslate('hello', lang, [member.user.username]))
    .addFields(
      {
        name: await getTranslate('join_msg_p1_name', lang),
        value: await getTranslate('join_msg_p1_value', lang),
        inline: false,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
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
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p3_name', lang),
        value: await getTranslate('join_msg_p3_value', lang),
        inline: false,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p4_name', lang),
        value: await getTranslate('join_msg_p4_value', lang),
        inline: false,
      },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    await ButtonVerificationWebsite(lang),
    await ButtonVerify(lang),
    await ButtonDiscordSupport(lang),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function getVerifiedMessageAnswer(isVerified: boolean, lang: string, member: User, selfVerify: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(await ButtonVerificationWebsite(lang));

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

export async function getVerificationGuildMessage(lang: string) {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(await getTranslate('welcome_on_our_server', lang))
    .addFields(
      {
        name: await getTranslate('setup_msg_p1_name', lang),
        value: await getTranslate('setup_msg_p1_value', lang),
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
      },
      {
        name: await getTranslate('setup_msg_p2_name', lang),
        value: await getTranslate('setup_msg_p2_value', lang),
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
      },
      {
        name: await getTranslate('setup_msg_p3_name', lang),
        value: await getTranslate('setup_msg_p3_value', lang),
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
      },
      {
        name: await getTranslate('setup_msg_p4_name', lang),
        value: await getTranslate('setup_msg_p4_value', lang, ['https://gmod-integration.com/legal/privacy']),
      },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    await ButtonVerificationWebsite(lang),
    await ButtonVerify(lang),
    await ButtonDiscordSupport(lang),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function getProfileMessage(guild: Guild, user: User) {
  const lang = guild.preferredLocale;

  let gm_user: any = {
    rank: 'user',
    trustLevel: 50,
  };

  const dbUser = await getUserFromDiscordID(user.id);
  if (dbUser) {
    gm_user = dbUser;
  }

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(await getTranslate('profile_info', lang))
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: '🪪⠀' + (await getTranslate('username', lang)),
        value: '<@' + user.id + '> / ' + user.username,
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
        inline: true,
      },
      {
        name: '🛠️⠀' + (await getTranslate('bot_rank', lang)),
        value: await getTranslate(gm_user.rank, lang),
        inline: true,
      },
      {
        name: '🛡️⠀' + (await getTranslate('trust_rank', lang)),
        value: await getTrustRank(gm_user.trustLevel, lang),
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(2),
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
        name: '🪪⠀' + (await getTranslate('discord_id', lang)),
        value: user.id,
        inline: true,
      },
      {
        name: '\u200b',
        value: getEmptyEmbedBuilderField(),
        inline: true,
      },
      {
        name: '🪪⠀' + (await getTranslate('steam_id', lang)),
        value: gm_user.steamID64 ? gm_user.steamID64 : await getTranslate('not_verified', lang),
        inline: true,
      },
    );

  const open_verify = await ButtonVerificationWebsite(lang);

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(open_verify);

  if (gm_user.steamID64) {
    const open_steam = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('⠀' + (await getTranslate('steam_profile', lang)))
      .setEmoji('🔗')
      .setURL(`https://steamcommunity.com/profiles/${gm_user.steamID64}`);
    row.addComponents(open_steam);
  }

  return {
    embeds: [embed],
    components: [row],
  };
}

export async function getUserStatisticMessage(
  user: User,
  serverInstanceID: string,
  guild: Guild,
  steamid?: string | null,
) {
  const lang = guild.preferredLocale;

  const customValueFormatList: { [key: string]: { format: (value: number) => string; emoji: string } } = {
    money: {
      format: (value: number) => {
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      },
      emoji: '💰',
    },
  };

  function customValueFormat(key: string, value: any) {
    if (customValueFormatList[key]) {
      return customValueFormatList[key].format(value);
    } else {
      return value;
    }
  }

  async function customValueFormatTitle(key: string, lang: string) {
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

  if (serverInstanceID === 'global') {
    const userData = await prisma.gm_user_steam.findFirst({
      where: {
        steam_id: steamID64ToUse!,
      },
    });

    if (!userData) {
      return { content: await getTranslate('user_not_found', lang), ephemeral: true };
    }

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(await getTranslate('stat_of_global', lang, [userData.username || userData.steam_id]))
      .setFields(
        {
          name: '🪪⠀' + (await getTranslate('username', lang)),
          value: userData.username ? userData.username : 'Unknown',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '🔪⠀' + (await getTranslate('total_kills', lang)),
          value: userData.total_kill ? userData.total_kill.toString() : '0',
          inline: true,
        },
        {
          name: '💀⠀' + (await getTranslate('total_deaths', lang)),
          value: userData.total_death ? userData.total_death.toString() : '0',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '⏳⠀' + (await getTranslate('total_time', lang)),
          value: userData.total_time ? secToTime(userData.total_time) : '0',
          inline: true,
        },
        {
          name: '🗓️⠀' + (await getTranslate('total_join', lang)),
          value: userData.total_connect ? userData.total_connect.toString() : '0',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '📅⠀' + (await getTranslate('last_join', lang)),
          value: userData.last_connect ? dateToDiscordTimestamp(userData.last_connect) : 'Never',
          inline: true,
        },
      );

    return {
      embeds: [embed],
    };
  } else {
    const serverDB = await prisma.gm_server.findFirst({
      where: {
        id: serverInstanceID,
      },
    });

    if (!serverDB) {
      return { content: await getTranslate('server_not_found', lang), ephemeral: true };
    }

    const userData = await prisma.gm_server_stat.findFirst({
      where: {
        steam_id: steamID64ToUse!,
        server_id: serverInstanceID,
      },
    });

    if (!userData) {
      return { content: await getTranslate('user_or_server_not_found', lang), ephemeral: true };
    }

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(await getTranslate('stat_of_server', lang, [userData.name || userData.steam_id]))
      .addFields(
        {
          name: '🪪⠀' + (await getTranslate('name', lang)),
          value: userData.name ? userData.name : 'Unknown',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '🛠️⠀' + (await getTranslate('rank', lang)),
          value: userData.rank ? userData.rank : 'Unknown',
          inline: true,
        },
        {
          name: '📅⠀' + (await getTranslate('first_join', lang)),
          value: userData.createdAt ? dateToDiscordTimestamp(userData.createdAt) : 'Never',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '📅⠀' + (await getTranslate('last_join', lang)),
          value: userData.updatedAt ? dateToDiscordTimestamp(userData.updatedAt) : 'Never',
          inline: true,
        },
        {
          name: '🔪⠀' + (await getTranslate('total_kills', lang)),
          value: userData.total_kill ? userData.total_kill.toString() : '0',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '💀⠀' + (await getTranslate('total_deaths', lang)),
          value: userData.total_death ? userData.total_death.toString() : '0',
          inline: true,
        },
        {
          name: '⏳⠀' + (await getTranslate('total_time', lang)),
          value: userData.total_time ? secToTime(userData.total_time).toString() : '0',
          inline: true,
        },
        {
          name: '\u200b',
          value: getEmptyEmbedBuilderField(2),
          inline: true,
        },
        {
          name: '🗓️⠀' + (await getTranslate('total_join', lang)),
          value: userData.total_connect ? userData.total_connect.toString() : '0',
          inline: true,
        },
      )
      .setFooter({ text: `SteamID: ${userData.steam_id} - Server: ${serverDB.name}` });

    if (userData.custom_values) {
      let acID = 1;
      for (const [key, value] of Object.entries(JSON.parse(userData.custom_values as string))) {
        embed.addFields({
          name: await customValueFormatTitle(key, lang),
          value: await customValueFormat(key, value).toString(),
          inline: true,
        });

        acID++;

        if (acID % 2 === 0) {
          embed.addFields({
            name: '\u200b',
            value: getEmptyEmbedBuilderField(2),
            inline: true,
          });
        }
      }
    }

    return { embeds: [embed] };
  }
}
