const steamApi = require('steamapi');
const {steamAPI} = require("../config");

const steam = new steamApi(steamAPI);

function getSteamApi() {
    return steam;
}

function getSteamUserSummary(steamID64) {
    return new Promise(async (resolve, reject) => {
        const summary = await steam.getUserSummary(steamID64);
        resolve(summary);
    });
}

function getSteamUserAvatars(steamID64) {
    return new Promise(async (resolve, reject) => {
        const summary = await steam.getUserSummary(steamID64);
        resolve(summary.avatar);
    });
}

function getSteamUserAvatarLarge(steamID64) {
    return new Promise(async (resolve, reject) => {
        const summary = await steam.getUserSummary(steamID64);
        resolve(summary.avatar.large);
    });
}

module.exports = {
    getSteamApi,
    getSteamUserSummary,
    getSteamUserAvatars,
    getSteamUserAvatarLarge,
}