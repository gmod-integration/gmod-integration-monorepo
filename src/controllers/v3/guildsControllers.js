const {getConnection, getConnectionPromisse} = require("../../database/connection");
const {isGuildPremium} = require("../../classes/v3/Guild");
const {getTranslate} = require("../../utils/localizations");
const {wsSendToServer} = require("../../websockets");
const {getServersFromDiscordGuildID} = require("../../classes/v3/Server");

async function sendMessageToGmod(message) {
    if (message.author.bot || !message.guild) return;
    const lang = message.guild.preferredLocale;

    let serversInfo = await getServersFromDiscordGuildID(message.guild.id);
    for (const server of serversInfo) {
        if (!server.isValid()) {
            serversInfo.splice(serversInfo.indexOf(server), 1);
            continue;
        }

        const syncChat = await server.getSetting('syncChat');
        if (!syncChat || syncChat === 'false') {
            serversInfo.splice(serversInfo.indexOf(server), 1);
            continue;
        }

        const syncChatDirection = await server.getSetting('syncChatDirection');
        if (syncChatDirection === 'gmodToDiscord') {
            serversInfo.splice(serversInfo.indexOf(server), 1);
        }
    }

    const connection = await getConnectionPromisse();
    const [rows] = await connection.query('SELECT * FROM gm_sync_chat WHERE guild = ? AND channel', [message.guild.id, message.channel.id]);
    if (!rows || rows.length === 0) return;
    if (!await isGuildPremium(message.guild.id)) {
        return message.reply({
            content: getTranslate('premium_required', lang),
            ephemeral: true
        });
    } else {
        for (const row of rows) {
            if (!serversInfo.find(server => server.getID() === row.server)) continue;
            wsSendToServer(
                row.server,
                {
                    method: 'wsPlayerSay',
                    name: message.author.username,
                    content: message.content,
                    avatar: message.author.displayAvatarURL({format: 'png', dynamic: true}),
                }
            );
        }
    }
}


module.exports = {
    sendMessageToGmod,
}