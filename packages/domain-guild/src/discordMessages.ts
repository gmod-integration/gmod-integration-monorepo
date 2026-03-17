import { ConfigDiscord } from '@gmod/config'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type User } from 'discord.js'
import { getTranslate } from './localizations.js'

export async function ButtonVerificationWebsite(lang: string, guildID?: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('verify_yourself', lang)}`)
    .setEmoji('🛡️')
    .setURL(
      ConfigDiscord.oauthPanel +
        '&state=' +
        encodeURIComponent('redirect:/account?startVerification=true' + (guildID ? `&guildID=${guildID}` : '')),
    )
}

export async function ButtonVerify(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setLabel(`⠀${await getTranslate('check_verification', lang)}`)
    .setEmoji('🔎')
    .setCustomId('verify')
}

export async function ButtonDiscordSupport(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('discord_support', lang)}`)
    .setEmoji('🚨')
    .setURL('https://discord.gg/AexDDx5RaU')
}

export async function ButtonPremium(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Primary)
    .setLabel(`⠀${await getTranslate('premium', lang)}`)
    .setEmoji('💎')
    .setCustomId('premium')
}

export async function getVerifiedMessageAnswer(isVerified: boolean, lang: string, member: User, selfVerify: boolean) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(await ButtonVerificationWebsite(lang))

  if (isVerified) {
    if (selfVerify) {
      return {
        content: await getTranslate('user_verified_self', lang),
        ephemeral: true,
      }
    }

    return {
      content: await getTranslate('user_verified', lang, [`<@${member.id}>`]),
      ephemeral: true,
    }
  }

  if (selfVerify) {
    return {
      content: (await getTranslate('user_not_verified_self', lang, ['/verify'])) + '\n_ _',
      ephemeral: true,
      components: [row],
    }
  }

  return {
    content: (await getTranslate('user_not_verified', lang, [`<@${member.id}>`, '/verify'])) + '\n_ _',
    ephemeral: true,
    components: [row],
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
