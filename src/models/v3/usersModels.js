import {getConnectionPromise} from "../../database/connection.js";

export async function getProfile(steamID64) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_user WHERE steam = ?', [steamID64], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve({
                    discordID: results[0].id,
                    steamID64: results[0].steam,
                    trustFactor: results[0].trust,
                    rank: results[0].rank,
                    username: results[0].username,
                });
            } else {
                return resolve(null);
            }
        });
    });
}