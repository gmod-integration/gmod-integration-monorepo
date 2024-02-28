const {badArgument} = require("../../utils/tools");
const clientsModels = require('../../models/v3/clientsModels');
const {getConnection} = require("../../database/connection");
const {isGuildPremium} = require("../../classes/v3/Guild");
const {getTranslate} = require("../../utils/localizations");
const {wsSendToServer} = require("../../websockets");
const Server = require("../../classes/v3/Server");

async function sendMessageToGmod(message) {
    if (message.author.bot || !message.guild) return;
    const lang = message.guild.preferredLocale;

    const servInfo = await Server.getServerFromDiscordGuildID(message.guild.id);
    if (!servInfo.isValid()) {
        return message.reply({
            content: getTranslate('no_server_associated', lang),
            ephemeral: true
        });
    }

    const syncChat = await servInfo.getSetting('syncChat');
    console.log(syncChat);
    if (!syncChat || syncChat === 'false') {
        return message.reply({
            content: getTranslate('sync_chat_not_enabled', lang),
            ephemeral: true
        });
    }

    const syncChatDirection = await servInfo.getSetting('syncChatDirection');
    console.log(syncChatDirection);
    if (syncChatDirection === 'toDiscord') {
        return message.reply({
            content: getTranslate('sync_chat_not_enabled_from_discord', lang),
            ephemeral: true
        });
    }

    getConnection().then((connection) => {
        connection.query('SELECT * FROM gm_sync_chat WHERE guild = ? AND channel = ?', [message.guild.id, message.channel.id], async function (err, rows) {
            if (err) throw err;
            if (rows && rows.length > 0) {
                if (!await isGuildPremium(message.guild.id)) {
                    message.reply({
                        content: getTranslate('premium_feature_sync_chat_to_gmod', lang, [' [Gmod Integration - Premium](https://gmod-integration.com/premium)']),
                        ephemeral: true
                    });
                } else {
                    wsSendToServer(
                        servInfo.getID(),
                        {
                            method: 'wsPlayerSay',
                            name: message.author.username,
                            content: message.content,
                            avatar: message.author.displayAvatarURL({format: 'png', dynamic: true}),
                        }
                    );
                }
            }
        });
    });
}

module.exports = {
    sendMessageToGmod
}