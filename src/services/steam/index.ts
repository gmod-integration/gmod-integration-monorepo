import steamApi from 'steamapi';
import { steamConfig } from '../../config/index.js';
import redis from '../redis/index.js';

const steam = new steamApi(steamConfig.apiKey!);

export function getSteamApi() {
  return steam;
}

export function getSteamUserSummary(steamID64: string) {
  return new Promise(async (resolve, reject) => {
    const summary = await steam.getUserSummary(steamID64);
    resolve(summary);
  });
}

export function getSteamUserAvatars(steamID64: string) {
  return new Promise(async (resolve, reject) => {
    const summary = await steam.getUserSummary(steamID64);
    resolve(summary.avatar);
  });
}

export function getSteamUserAvatarLarge(steamID64: string) {
  return new Promise(async (resolve, reject) => {
    const redisKey = `steam:${steamID64}:avatar`;
    const redisValue = await redis.get(redisKey);
    if (redisValue) {
      return resolve(redisValue);
    }

    const summary = await steam.getUserSummary(steamID64);
    await redis.set(redisKey, summary.avatar.large, 'EX', 60 * 60 * 24 * 7);
    resolve(summary.avatar.large);
  });
}
