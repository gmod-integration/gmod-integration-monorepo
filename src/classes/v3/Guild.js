const {getConnection} = require("../../database/connection");
const axios = require("axios");
const {
    client_id
} = require("../../config");

async function isGuildPremium(guildID) {
    return new Promise(async (resolve, reject) => {
        const response = await axios.get(`https://discord.com/api/v10/applications/${client_id}/entitlements`, {
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
            }
        });

        let isPremium = false;
        await response.data.forEach(entitlement => {
            if (entitlement.guild_id === guildID) {
                isPremium = true;
            }
        });

        resolve(isPremium);
    });
}

async function replyNeedPremium(interaction) {
    const url = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`;
    const json = {
        type: 10,
        data: {}
    };

    await axios.post(url, json, {
        headers: {
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    }).catch(err => {
        console.error(err);
    });
}

module.exports = {
    isGuildPremium,
    replyNeedPremium
}