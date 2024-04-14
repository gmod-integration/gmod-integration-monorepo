import {getConnectionPromise} from "../../database/connection.js";

export function getInformations(id) {
    return new Promise((resolve, reject) => {
        const connection = await getConnectionPromise();
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
    const connection = await getConnectionPromise();
    const [rows] = connection.query('SELECT * FROM gm_server WHERE id = ?', [id]);
    if (rows.length > 0) {
        return rows[0].guild;
    }
    return null;
}

export function isValidAuth(id, token) {
    const connection = await getConnectionPromise();
    const [rows] = connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token]);
    return rows.length > 0;
}

export function saveStatus(serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime) {
    const connection = await getConnectionPromise();
    const query = 'INSERT INTO gm_server_status_v3 (serverID, players, maxPlayers, map, hostname, gameMode, port, ip, uptime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE players = ?, maxPlayers = ?, map = ?, hostname = ?, gameMode = ?, port = ?, ip = ?, uptime = ?';
    const values = [serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime];
    connection.query(query, values, (error) => {
        if (error) {
            console.error(error);
            return false;
        }
        return true;
    });

    // TODO: Change to new
    // connection.query('INSERT INTO gm_server_status_v3 (serverID, players, maxPlayers, map, hostname, gameMode, port, ip, uptime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE players = ?, maxPlayers = ?, map = ?, hostname = ?, gameMode = ?, port = ?, ip = ?, uptime = ?', [serverID, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime, players, maxPlayers, map, hostname, gameMode, port, extractIP, uptime], (error) => {
    //     if (error) return reject(error);
    //     resolve();
    // });
}

export function addServerLog(id, log) {
    const connection = await getConnectionPromise();
    const query = 'INSERT INTO gm_server_logs (serverID, type, data) VALUES (?, ?, ?)';
    const values = [id, log.type, JSON.stringify(log.data)];
    connection.query(query, values, (error) => {
        if (error) {
            console.error(error);
            return false;
        }
        return true;
    });
}

export async function getServerList(interaction, focusedOption, choices) {
    const connection = await getConnectionPromise();
    const [rows] = await connection.query(`SELECT *
                                           FROM gm_server
                                           WHERE guild = ?`, [interaction.guild.id]);
    if (rows && rows.length > 0) {
        rows.forEach(row => {
            choices[row.name] = row.id;
        });
    }

    return Object.keys(choices).filter(choice => choice.startsWith(focusedOption.value));
}