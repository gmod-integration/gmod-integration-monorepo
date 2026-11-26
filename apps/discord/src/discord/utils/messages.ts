import { getTranslate } from '@gmod/core/utils/localizations.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type User,
} from 'discord.js'
import { ButtonConnect, ButtonDiscordSupport, ButtonVerificationWebsite, ButtonVerify } from './buttons.js'
import { getCurrencyByLang } from '@gmod/core/utils/tools.js'
import { ConfigDiscord } from '@gmod/config'
import { getUserFromDiscordID } from '@gmod/domain-user/User.js'
import { dateToDiscordTimestamp, getServerChart, getTrustRank, secToTime } from './index.js'
import { type Server } from '@gmod/domain-server/Server.js'
import { buildServerStatusMessage, getEmptyEmbedBuilderField } from '@gmod/core/utils/statusMessage.js'
import prisma from '@gmod/infra-prisma'

export { getEmptyEmbedBuilderField }

/** Real publication uses the same local builder as website previews. */
export async function getStatusMessage(
  server: Server,
  data: any,
  lang: string,
  options: { persistChart?: boolean } = {},
) {
  return buildServerStatusMessage(server, data, lang, options, { getServerChart, ButtonConnect })
}

export async function getNotVerifiedMessage(guild: Guild, member: GuildMember) {
  const lang = guild.preferredLocale

  const embed = new EmbedBuilder()
    .setColor(ConfigDiscord.embedColor)
    .setTitle(await getTranslate('hello', lang, [member.user.username]))
    .addFields(
      {
        name: await getTranslate('join_msg_p1_name', lang),
        value: (await getTranslate('join_msg_p1_value', lang)) + '\n \u200b',
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p2_name', lang),
        value:
          (await getTranslate('join_msg_p2_value', lang, [
            `[Garry's Mod Integration](${ConfigDiscord.oauthPanel}&state=redirect:/account?startVerification=true)`,
          ])) + '\n \u200b',
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p3_name', lang),
        value: (await getTranslate('join_msg_p3_value', lang)) + '\n \u200b',
        inline: false,
      },
      {
        name: await getTranslate('join_msg_p4_name', lang),
        value: await getTranslate('join_msg_p4_value', lang),
        inline: false,
      },
    )

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    await ButtonVerificationWebsite(lang),
    await ButtonVerify(lang),
    await ButtonDiscordSupport(lang),
  )

  return {
    embeds: [embed],
    components: [row],
  }
}

export async function getVerifiedMessageAnswer(isVerified: boolean, lang: string, member: User, selfVerify: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(await ButtonVerificationWebsite(lang))

  if (isVerified) {
    if (selfVerify) {
      return {
        content: await getTranslate('user_verified_self', lang),
        ephemeral: true,
      }
    } else {
      return {
        content: await getTranslate('user_verified', lang, [`<@${member.id}>`]),
        ephemeral: true,
      }
    }
  } else {
    if (selfVerify) {
      return {
        content: (await getTranslate('user_not_verified_self', lang, ['/verify'])) + '\n_ _',
        ephemeral: true,
        components: [row],
      }
    } else {
      return {
        content: (await getTranslate('user_not_verified', lang, [`<@${member.id}>`, '/verify'])) + '\n_ _',
        ephemeral: true,
        components: [row],
      }
    }
  }
}

export async function getVerificationGuildMessage(lang: string, guildID: string) {
  const embed = new EmbedBuilder()
    .setColor(ConfigDiscord.embedColor)
    .setTitle(await getTranslate('welcome_on_our_server', lang))
    .addFields(
      {
        name: await getTranslate('setup_msg_p1_name', lang),
        value: (await getTranslate('setup_msg_p1_value', lang)) + '\n \u200b',
      },
      {
        name: await getTranslate('setup_msg_p2_name', lang),
        value: (await getTranslate('setup_msg_p2_value', lang)) + '\n \u200b',
      },
      {
        name: await getTranslate('setup_msg_p3_name', lang),
        value: (await getTranslate('setup_msg_p3_value', lang)) + '\n \u200b',
      },
      {
        name: await getTranslate('setup_msg_p4_name', lang),
        value: await getTranslate('setup_msg_p4_value', lang, ['https://gmod-integration.com/legal/privacy']),
      },
    )

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    await ButtonVerificationWebsite(lang, guildID),
    await ButtonVerify(lang),
    await ButtonDiscordSupport(lang),
  )

  return {
    embeds: [embed],
    components: [row],
  }
}

export async function getProfileMessage(guild: Guild, user: User) {
  const lang = guild.preferredLocale

  let gm_user: any = {
    rank: 'user',
    trustLevel: 50,
  }

  const dbUser = await getUserFromDiscordID(user.id)
  if (dbUser) {
    gm_user = dbUser
  }

  const embed = new EmbedBuilder()
    .setColor(ConfigDiscord.embedColor)
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
    )

  const open_verify = await ButtonVerificationWebsite(lang)

  const row = new ActionRowBuilder<ButtonBuilder>()
  row.addComponents(open_verify)

  if (gm_user.steamID64) {
    const open_steam = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('⠀' + (await getTranslate('steam_profile', lang)))
      .setEmoji('🔗')
      .setURL(`https://steamcommunity.com/profiles/${gm_user.steamID64}`)
    row.addComponents(open_steam)
  }

  return {
    embeds: [embed],
    components: [row],
  }
}

export async function getUserStatisticMessage(
  user: User,
  serverInstanceID: string,
  guild: Guild,
  steamid?: string | null,
) {
  const lang = guild.preferredLocale

  const customValueFormatList: { [key: string]: { format: (value: any) => string; emoji: string } } = {
    money: {
      format: (value: number) => {
        return value.toLocaleString(lang, {
          style: 'currency',
          currency: getCurrencyByLang(lang),
        })
      },
      emoji: '💰',
    },
    bank: {
      format: (value: number) => {
        return value.toLocaleString(lang, {
          style: 'currency',
          currency: getCurrencyByLang(lang),
        })
      },
      emoji: '🏦',
    },
    job: {
      format: (value: string) => {
        return value.toString()
      },
      emoji: '👔',
    },
  }

  function customValueFormat(key: string, value: any) {
    if (customValueFormatList[key]) {
      return customValueFormatList[key].format(value)
    } else {
      return value
    }
  }

  async function customValueFormatTitle(key: string, lang: string) {
    if (customValueFormatList[key]) {
      return customValueFormatList[key].emoji + '⠀' + (await getTranslate(key, lang))
    } else {
      return key
    }
  }

  let steamID64ToUse
  if (!steamid) {
    const dbUser = await getUserFromDiscordID(user.id)
    if (!dbUser) {
      return { content: await getTranslate('user_not_linked', lang), ephemeral: true }
    }
    steamID64ToUse = dbUser.steamID64
  } else {
    steamID64ToUse = steamid
  }

  if (serverInstanceID === 'global') {
    const userData = await prisma.gm_user_steam.findFirst({
      where: {
        steam_id: steamID64ToUse!,
      },
    })

    if (!userData) {
      return { content: await getTranslate('user_not_found', lang), ephemeral: true }
    }

    const embed = new EmbedBuilder()
      .setColor(ConfigDiscord.embedColor)
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
      )

    return {
      embeds: [embed],
    }
  } else {
    const serverDB = await prisma.gm_server.findFirst({
      where: {
        id: serverInstanceID,
        guild: guild.id,
      },
      select: { id: true, name: true },
    })

    if (!serverDB) {
      return { content: await getTranslate('server_not_found', lang), ephemeral: true }
    }

    const userData = await prisma.gm_server_stat.findFirst({
      where: {
        steam_id: steamID64ToUse!,
        server_id: serverInstanceID,
      },
    })

    if (!userData) {
      return { content: await getTranslate('user_or_server_not_found', lang), ephemeral: true }
    }

    const embed = new EmbedBuilder()
      .setColor(ConfigDiscord.embedColor)
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
      .setFooter({ text: `SteamID: ${userData.steam_id} - Server: ${serverDB.name}` })

    if (userData.custom_values) {
      let acID = 1
      for (const [key, value] of Object.entries(JSON.parse(userData.custom_values as string))) {
        embed.addFields({
          name: await customValueFormatTitle(key, lang),
          value: await customValueFormat(key, value).toString(),
          inline: true,
        })

        acID++

        if (acID % 2 === 0) {
          embed.addFields({
            name: '\u200b',
            value: getEmptyEmbedBuilderField(2),
            inline: true,
          })
        }
      }
    }

    return { embeds: [embed] }
  }
}
