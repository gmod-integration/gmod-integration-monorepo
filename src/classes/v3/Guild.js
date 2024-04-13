import axios from 'axios';
import {discordConfig} from '../../config/index.js';

export async function isGuildPremium(guildID) {
    return new Promise(async (resolve, reject) => {
        const response = await axios.get(`https://discord.com/api/v10/applications/${discordConfig.clientID}/entitlements`, {
            headers: {
                'Authorization': `Bot ${discordConfig.botToken}`
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

export async function replyNeedPremium(interaction) {
    const url = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`;
    const json = {
        type: 10,
        data: {}
    };

    await axios.post(url, json, {
        headers: {
            'Authorization': `Bot ${discordConfig.botToken}`,
            'Content-Type': 'application/json'
        }
    }).catch(err => {
        console.error(err);
    });
}