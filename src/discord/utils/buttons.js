const {ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const {oauth, invite} = require("../../config");
const {getTranslate} = require("../../utils/localizations");

function ButtonVerificationWebsite(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('verify_yourself', lang))
        .setEmoji('🛡️')
        .setURL(oauth);
}

function ButtonWebsite(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('website', lang))
        .setEmoji('🌐')
        .setURL('https://gmod-integration.com');
}

function ButtonDiscordSupport(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('discord_support', lang))
        .setEmoji('🚨')
        .setURL('https://discord.gg/AexDDx5RaU');
}

function ButtonInviteBot(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('invite_bot', lang))
        .setEmoji('🔗')
        .setURL(invite);
}

function ButtonVerify(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setLabel('⠀' + getTranslate('check_verification', lang))
        .setEmoji('🔎')
        .setCustomId('verify');
}

function ButtonConnect(lang, ip, port) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-connect', lang))
        .setEmoji('🔗')
        .setURL(`https://gmod-integration.com/open-link?link=steam://connect/${ip}:${port}`);
}

function ButtonShop(lang, url) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-shop', lang))
        .setEmoji('🛒')
        .setURL('https://gmod-integration.com/open-link?link=' + url);
}

function ButtonWorkshop(lang, url) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-workshop', lang))
        .setEmoji('🔧')
        .setURL('https://gmod-integration.com/open-link?link=' + url);
}

function ButtonForum(lang, url) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('⠀' + getTranslate('server-forum', lang))
        .setEmoji('📜')
        .setURL('https://gmod-integration.com/open-link?link=' + url);
}

function ButtonPremium(lang) {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel('⠀' + getTranslate('premium', lang))
        .setEmoji('💎')
        .setCustomId('premium');
}

module.exports = {
    ButtonVerificationWebsite,
    ButtonWebsite,
    ButtonDiscordSupport,
    ButtonInviteBot,
    ButtonVerify,
    ButtonConnect,
    ButtonShop,
    ButtonWorkshop,
    ButtonForum,
    ButtonPremium,
}