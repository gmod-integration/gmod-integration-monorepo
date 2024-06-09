import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { discordConfig, serverConfig } from '../../config/index.js';
import { getTranslate } from '../../utils/localizations.js';

export async function ButtonVerificationWebsite(lang) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('verify_yourself', lang)}`)
    .setEmoji('🛡️')
    .setURL(discordConfig.oauthPanel + '&state=redirect:/account');
}

export async function ButtonWebsite(lang) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('website', lang)}`)
    .setEmoji('🌐')
    .setURL(serverConfig.websiteUrl);
}

export async function ButtonDiscordSupport(lang) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('discord_support', lang)}`)
    .setEmoji('🚨')
    .setURL('https://discord.gg/AexDDx5RaU');
}

export async function ButtonInviteBot(lang) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('invite_bot', lang)}`)
    .setEmoji('🔗')
    .setURL(discordConfig.invite);
}

export async function ButtonVerify(lang) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setLabel(`⠀${await getTranslate('check_verification', lang)}`)
    .setEmoji('🔎')
    .setCustomId('verify');
}

export async function ButtonConnect(lang, ip, port) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('server-connect', lang)}`)
    .setEmoji('🔗')
    .setURL(`${serverConfig.websiteUrl}/open?link=steam://connect/${ip}:${port}`);
}

export async function ButtonPremium(lang) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Primary)
    .setLabel(`⠀${await getTranslate('premium', lang)}`)
    .setEmoji('💎')
    .setCustomId('premium');
}
