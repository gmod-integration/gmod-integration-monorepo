import steamApi from 'steamapi';
import {steamConfig} from "../config/index.js";

const steam = new steamApi(steamConfig.apiKey);

export function getSteamApi() {
    return steam;
}

export function getSteamUserSummary(steamID64) {
    return new Promise(async (resolve, reject) => {
        const summary = await steam.getUserSummary(steamID64);
        resolve(summary);
    });
}

export function getSteamUserAvatars(steamID64) {
    return new Promise(async (resolve, reject) => {
        const summary = await steam.getUserSummary(steamID64);
        resolve(summary.avatar);
    });
}

export function getSteamUserAvatarLarge(steamID64) {
    return new Promise(async (resolve, reject) => {
        const summary = await steam.getUserSummary(steamID64);
        resolve(summary.avatar.large);
    });
}