const {getConnection} = require("../../database/connection");

class User {
    constructor(obj = {}) {
        this.steamID64 = obj.steamID64 || null;
        this.discordID = obj.discordID || null;
        this.rank = obj.rank
        this.lastVerification = obj.lastVerification;
    }

    getDiscordID() {
        return this.discordID;
    }

    getSteamID64() {
        return this.steamID64;
    }
}

function getUser(userInfo) {
    const steamID64 = userInfo.steamID64;
    const discordID = userInfo.discordID;

    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_user WHERE steam = ? OR id = ?', [steamID64, discordID], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(new User({
                        steamID64: results[0].steam,
                        discordID: results[0].id,
                        rank: results[0].rank,
                        lastVerification: results[0].last_oauth
                    }));
                } else {
                    resolve(null);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function getUserFromSteamID64(steamID64) {
    return getUser({steamID64});
}

function getUserFromDiscordID(discordID) {
    return getUser({discordID});
}

module.exports = {
    User,
    getUser,
    getUserFromSteamID64,
    getUserFromDiscordID,
}