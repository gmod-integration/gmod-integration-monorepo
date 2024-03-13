const {getConnectionPromisse} = require("../../database/connection");
const {isGuildPremium} = require("../../classes/v3/Guild");
const {getTranslate} = require("../../utils/localizations");
const {wsSendToServer} = require("../../websockets");
const {getServersFromDiscordGuildID} = require("../../classes/v3/Server");

async function sendMessageToGmod(message) {
    if (message.author.bot || !message.guild) return;
    const lang = message.guild.preferredLocale;

    const connection = await getConnectionPromisse();
    const [rows] = await connection.query('SELECT * FROM gm_sync_chat WHERE guild = ? AND channel = ?', [message.guild.id, message.channel.id]);

    if (!rows || rows.length === 0) return;

    let serversInfo = await getServersFromDiscordGuildID(message.guild.id);

    for (const row of rows) {
        const server = serversInfo.find(server => server.getID() === row.server);
        if (!server || !server.isValid()) {
            continue;
        }

        const syncChat = await server.getSetting('syncChat');
        if (!syncChat || syncChat === 'false') {
            continue;
        }

        const syncChatDirection = await server.getSetting('syncChatDirection');
        if (syncChatDirection === "gmodToDiscord") {
            continue;
        }

        if (!await isGuildPremium(message.guild.id)) {
            message.reply({
                content: getTranslate('premium_required', lang),
                ephemeral: true
            });
            return;
        }

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

module.exports = {
    sendMessageToGmod,
};
