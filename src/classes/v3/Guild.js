import axios from 'axios';
import { discordConfig } from '../../config/index.js';
import redis from '../../redis/index.js';
import { getConnectionPromise } from '../../database/connection.js';

export async function isGuildPremium(guildID) {
  const redisKey = `guild:${guildID}:premium`;
  const redisKey2 = `discord:entitlements`;

  try {
    const cachedPremiumStatus = await redis.get(redisKey);
    if (cachedPremiumStatus !== null) {
      return JSON.parse(cachedPremiumStatus);
    }

    let entitlementGuilds = await redis.get(redisKey2);
    if (entitlementGuilds === null) {
      const response = await axios.get(
        `https://discord.com/api/v10/applications/${discordConfig.clientID}/entitlements`,
        {
          headers: {
            Authorization: `Bot ${discordConfig.botToken}`,
          },
        }
      );
      entitlementGuilds = response.data;
      await redis.set(redisKey2, JSON.stringify(entitlementGuilds), 'EX', 60);
    } else {
      entitlementGuilds = JSON.parse(entitlementGuilds);
    }

    let isPremium = entitlementGuilds.some(entitlement => entitlement.guild_id === guildID);
    await redis.set(redisKey, JSON.stringify(isPremium), 'EX', 60); // Cache the result

    return isPremium;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
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

export async function getGuildLinks(guildID) {
  const connection = await getConnectionPromise();
  const [rows] = await connection.execute('SELECT * FROM gm_link WHERE guild = ? AND active = 1', [guildID]);
  return rows || [];
}

export async function getGuildLink(guildID, linkID) {
  const connection = await getConnectionPromise();
  const [rows] = await connection.execute('SELECT * FROM gm_link WHERE guild = ? AND id = ? AND active = 1', [
    guildID,
    linkID,
  ]);
  return rows[0] || null;
}
