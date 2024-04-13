import {ButtonBuilder, ButtonStyle} from "discord.js";
import {discordConfig} from "../../config";
import {getTranslate} from "../../utils/localizations.js";

export function ButtonVerificationWebsite(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('verify_yourself', lang))
        .setEmoji('🛡️')
        .setURL(discordConfig.oauth);
}

export function ButtonWebsite(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('website', lang))
        .setEmoji('🌐')
        .setURL('https://gmod-integration.com');
}

export function ButtonDiscordSupport(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('discord_support', lang))
        .setEmoji('🚨')
        .setURL('https://discord.gg/AexDDx5RaU');
}

export function ButtonInviteBot(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('invite_bot', lang))
        .setEmoji('🔗')
        .setURL(discordConfig.invite);
}

export function ButtonVerify(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setLabel('⠀' + getTranslate('check_verification', lang))
        .setEmoji('🔎')
        .setCustomId('verify');
}

export function ButtonConnect(lang, ip, port) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-connect', lang))
        .setEmoji('🔗')
        .setURL(`https://gmod-integration.com/open-link?link=steam://connect/${ip}:${port}`);
}

export function ButtonShop(lang, url) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-shop', lang))
        .setEmoji('🛒')
        .setURL('https://gmod-integration.com/open-link?link=' + url);
}

export function ButtonWorkshop(lang, url) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-workshop', lang))
        .setEmoji('🔧')
        .setURL('https://gmod-integration.com/open-link?link=' + url);
}

export function ButtonForum(lang, url) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-forum', lang))
        .setEmoji('📜')
        .setURL('https://gmod-integration.com/open-link?link=' + url);
}

export function ButtonPremium(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel('⠀' + getTranslate('premium', lang))
        .setEmoji('💎')
        .setCustomId('premium');
}