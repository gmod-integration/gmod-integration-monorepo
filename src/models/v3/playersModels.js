import {getConnection} from "../../database/connection";

async function getPlayerDiscordIDFromSteamID64(steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_user WHERE steam = ?', [steamID64], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(results[0].id);
                } else {
                    return resolve(null);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

async function getPlayerSteamID64FromDiscordID(discordID) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_user WHERE id = ?', [discordID], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(results[0].steam);
                } else {
                    return resolve(null);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    getPlayerDiscordIDFromSteamID64,
    getPlayerSteamID64FromDiscordID
}