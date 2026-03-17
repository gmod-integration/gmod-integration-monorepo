import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { ConfigDiscord, ConfigServer } from '@gmod/config';
import { getTranslate } from '../../utils/localizations.js';

export async function ButtonVerificationWebsite(lang: string, guildID?: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('verify_yourself', lang)}`)
    .setEmoji('🛡️')
    .setURL(
      ConfigDiscord.oauthPanel +
        '&state=' +
        encodeURIComponent('redirect:/account?startVerification=true' + (guildID ? `&guildID=${guildID}` : '')),
    );
}

export async function ButtonWebsite(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('website', lang)}`)
    .setEmoji('🌐')
    .setURL(ConfigServer.websiteUrl!);
}

export async function ButtonDiscordSupport(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('discord_support', lang)}`)
    .setEmoji('🚨')
    .setURL('https://discord.gg/AexDDx5RaU');
}

export async function ButtonInviteBot(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('invite_bot', lang)}`)
    .setEmoji('🔗')
    .setURL(ConfigDiscord.invite!);
}

export async function ButtonVerify(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setLabel(`⠀${await getTranslate('check_verification', lang)}`)
    .setEmoji('🔎')
    .setCustomId('verify');
}

export async function ButtonConnect(lang: string, ip: string, port: string) {
  if (ip.includes(':')) {
    ip = ip.split(':')[0];
  }
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(`⠀${await getTranslate('server-connect', lang)}`)
    .setEmoji('🔗')
    .setURL(`${ConfigServer.websiteUrl}/open?link=steam://connect/${ip}:${port}`);
}

export async function ButtonPremium(lang: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Primary)
    .setLabel(`⠀${await getTranslate('premium', lang)}`)
    .setEmoji('💎')
    .setCustomId('premium');
}
