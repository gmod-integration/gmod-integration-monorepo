import axios from 'axios';
import { discordConfig } from '../../config/index.js';
import redis from '../../redis/index.js';

export async function isGuildPremium(guildID) {
  return new Promise(async (resolve, reject) => {
    const redisKey = `guild:${guildID}:premium`;
    const redisData = await redis.get(redisKey);
    if (redisData) {
      return JSON.parse(redisData);
    }

    const redisKey2 = `discord:entitlements`;
    const redisData2 = await redis.get(redisKey);
    let response = null;
    if (redisData2) {
      response = JSON.parse(redisData2);
    } else {
      response = await axios.get(`https://discord.com/api/v10/applications/${discordConfig.clientID}/entitlements`, {
        headers: {
          Authorization: `Bot ${discordConfig.botToken}`,
        },
      });
      redis.set(redisKey2, JSON.stringify(response.data), 'EX', 60);
    }

    let isPremium = false;
    await response.data.forEach((entitlement) => {
      if (entitlement.guild_id === guildID) {
        isPremium = true;
        redis.set(redisKey, JSON.stringify(isPremium), 'EX', 60);
      }
    });

    resolve(isPremium);
  });
}

export async function replyNeedPremium(interaction) {
  const url = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`;
  const json = {
    type: 10,
    data: {},
  };

  await axios
    .post(url, json, {
      headers: {
        Authorization: `Bot ${discordConfig.botToken}`,
        'Content-Type': 'application/json',
      },
    })
    .catch((err) => {
      console.error(err);
    });
}
