import {getConnectionPromise} from "../../database/connection.js";

export function getInformations(id) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(results[0]);
            } else {
                reject('Server not found');
            }
        });
    });
}

export function getGuildID(id) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(results[0].guild);
            } else {
                reject('Server not found');
            }
        });
    });
}

export function isValidAuth(id, token) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(true);
            } else {
                return resolve(false);
            }
        });
    });
}

export function saveStatus(serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        // Old
        connection.query('INSERT INTO gm_server_status(id, ip, port, last_update, hostname, maxplayers, players, map, gamemode) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE last_update = NOW(), hostname = ?, maxplayers = ?, players = ?, map = ?, gamemode = ?', [serverID, extractIP, port, hostname, maxPlayers, players, map, gameMode, hostname, maxPlayers, players, map, gameMode], (error) => {
            if (error) return reject(error);
            resolve();
        });
        // TODO: Change to new
        // connection.query('INSERT INTO gm_server_status_v3 (serverID, players, maxPlayers, map, hostname, gameMode, port, ip, uptime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE players = ?, maxPlayers = ?, map = ?, hostname = ?, gameMode = ?, port = ?, ip = ?, uptime = ?', [serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime], (error) => {
        //     if (error) return reject(error);
        //     resolve();
        // });
    });
}

export function addServerLog(id, log) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('INSERT INTO gm_server_logs (serverID, type, data) VALUES (?, ?, ?)', [id, log.type, JSON.stringify(log.data)], (error) => {
            if (error) {
                console.error(error);
                reject(error);
            }
            resolve();
        });
    });
}

export async function getServerList(interaction, focusedOption, choices, callback) {
    return new Promise(async (resolve, reject) => {
        const connection = await getConnectionPromise();
        connection.query(`SELECT *
                          FROM gm_server
                          WHERE guild = ?`, [interaction.guild.id], (err, rows) => {
            if (rows && rows.length > 0) {
                rows.forEach(row => {
                    choices[row.name] = row.id;
                });
            }
            const filtered = Object.keys(choices).filter(choice => choice.startsWith(focusedOption.value));
            resolve(filtered);
        });
    });
}