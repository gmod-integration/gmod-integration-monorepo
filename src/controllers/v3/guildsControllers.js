const {getConnectionPromisse} = require("../../database/connection");
const {isGuildPremium, replyNeedPremium} = require("../../classes/v3/Guild");
const {getTranslate} = require("../../utils/localizations");
const {wsSendToServer} = require("../../websockets");
const {getServersFromDiscordGuildID} = require("../../classes/v3/Server");
const {ButtonPremium} = require("../../discord/utils/buttons");
const {ActionRowBuilder} = require("discord.js");

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
            console.error(`Server ${row.server} not found`);
            continue;
        }

        const syncChatChannel = await server.getSyncChatChannel();
        if (!syncChatChannel) {
            console.error(`Server ${row.server} not syncing chat because syncChatChannel is not set`);
            continue;
        }

        const syncChatDirection = await server.getSetting('syncChatDirection');
        if (syncChatDirection === "gmodToDiscord") {
            console.log(`Server ${row.server} syncing chat from Gmod to Discord`);
            continue;
        }

        if (!await isGuildPremium(message.guild.id)) {
            // create button to upgrade
            // ButtonPremium()
            return message.reply({
                content: getTranslate('premium_required', lang),
                ephemeral: true,
                components: [new ActionRowBuilder().addComponents(ButtonPremium(lang))],
            });
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
