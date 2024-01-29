const fs = require('fs');
const readline = require('readline');
const mysql = require('mysql2');
const {dbConfig} = require('./config/index');
const connection = mysql.createConnection(dbConfig);

function formatToDate(logLine) {
    const str = logLine.substring(1, 20);
    const date = new Date(str);
    if (date.toString() === 'Invalid Date') {
        return null;
    } else {
        return date;
    }
}

function addressToIP(address) {
    // address example '37.175.165.14:36675'
    return address.split(':')[0];
}

const endpoints = [
    'server/user/connect',
    'server/user/disconnect',
];

// Fonction pour extraire les données souhaitées
function extractData(line) {
    // regex all endpoint example of log '[2023-12-31 11:07:43] [API] RequestID #6jhwueui Method: POST URL: /server/user/connect IP: 141.94.99.196 Version: 0.1.9 Server ID: u1FuySgoUn Body: {"address":"91.168.136.119:27005","bot":0,"index":0,"steam":"76561199172728913","networkid":"STEAM_0:1:606231592","name":"celmix.","userid":6} Query: {}'
    const regex = /\[([0-9- :]+)\] \[API\] RequestID #([a-zA-Z0-9]+) Method: ([A-Z]+) URL: \/([a-zA-Z0-9\/]+) IP: ([0-9.]+) Version: ([0-9.]+) Server ID: ([a-zA-Z0-9]+) Body: (.+) Query: (.+)/;
    const match = line.match(regex);

    if (match) {
        const data = JSON.parse(match[8]);

        data.requestID = match[2];
        data.method = match[3];
        data.endpoint = match[4];
        data.version = match[6];
        data.serverID = match[7];

        data.date = formatToDate(line);

        if (!endpoints.includes(data.endpoint) || !data.date) {
            return null;
        } else {
            return data;
        }
    }

    return null;
}

function isValidConnection(data) {
    if (data.address && data.name && data.networkid && data.steam) {
        return true;
    }

    return false;
}

function isValidDisconnection(data) {
    if (data.deaths && data.time && data.steam && data.rank && data.kills) {
        return true;
    }

    return false;
}

function saveGlobalUser(data) {
    return new Promise((resolve, reject) => {
        connection.query('SELECT lastUpdate FROM users WHERE steamID64 = ?', [data.steam], (err, results) => {
            if (err) {
                reject(err);
                return;
            }

            if (results.length > 0) {
                const lastUpdate = results[0].lastUpdate;
                const ips = JSON.parse(results[0].IPS || '[]');
                ips.push(data.address);

                if (data.date > lastUpdate) {
                    connection.query('UPDATE users SET name = ?, lastUpdate = ?, lastIP = ?, IPS = ? WHERE steamID64 = ?', [data.name, data.date, data.address, JSON.stringify(ips), data.steam], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                }
            } else {
                connection.query('INSERT IGNORE INTO users (steamID64, steamID, name, lastUpdate, lastIP, IPS) VALUES (?, ?, ?, ?, ?, ?)', [data.steam, data.networkid, data.name, data.date, data.address, JSON.stringify([data.address])], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        });
    });
}

function saveUser(data) {
    return new Promise((resolve, reject) => {
        connection.query('SELECT last_connect FROM gm_user_steam WHERE steam_id = ?', [data.steam], (err, results) => {
            if (err) {
                reject(err);
                return;
            }

            if (results.length > 0) {
                const lastConnect = results[0].last_connect;
                if (data.date > lastConnect) {
                    connection.query('UPDATE gm_user_steam SET username = ?, last_ip = ?, last_connect = ? WHERE steam_id = ?', [data.name, data.address, data.date, data.steam], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            } else {
                connection.query('INSERT IGNORE INTO gm_user_steam (steam_id, username, last_ip, last_connect) VALUES (?, ?, ?, ?)', [data.steam, data.name, data.address, data.date], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        });
    });
}

function saveDisconnect(data) {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO gm_server_stat (server_id, steam_id, name, rank, total_time, total_death, total_kill,
                                        custom_values)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE total_time    = total_time + ?,
                                    total_death   = total_death + ?,
                                    total_kill    = total_kill + ?,
                                    custom_values = ?,
                                    last_connect  = DEFAULT
        `;

        const values = [
            data.serverID,
            data.steam,
            data.name,
            data.rank,
            data.time,
            data.deaths,
            data.kills,
            JSON.stringify(data.customValues || []),
            data.time,
            data.deaths,
            data.kills,
            JSON.stringify(data.customValues || [])
        ];

        connection.query(query, values, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function saveUserSession(data) {
    return new Promise((resolve, reject) => {
        connection.query('SELECT sessionEndTimeStamp FROM gm_server_stat_session WHERE steamID64 = ? AND serverID = ? AND sessionEndTimeStamp = ?', [data.steam, data.serverID, data.date], (error, results) => {
            if (error) {
                reject(error);
            } else {
                if (results.length > 0) {
                    resolve();
                } else {
                    connection.query('INSERT INTO gm_server_stat_session(serverID, steamID64, time, deaths, kills, customValues, sessionEndTimeStamp) VALUES (?, ?, ?, ?, ?, ?, ?)', [data.serverID, data.steam, data.time, data.deaths, data.kills, JSON.stringify(data.customValues || []), data.date], (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                }
            }
        });
    });
}

connection.connect((err) => {
    if (err) {
        console.log('Error connecting to DB');
        return;
    }

    console.log('Connection Established, starting reading file...');

    /*
    // Créer une interface de lecture de ligne par ligne pour le fichier de log
    const rl = readline.createInterface({
        input: fs.createReadStream('./logs/2024-01-04.log'),
        output: process.stdout,
        terminal: false
    })

    let lineCount = 0;
    rl.on('line', (line) => {
        lineCount++;
        console.log(`${lineCount}`);
        let data = extractData(line);

        if (!data) {
            return;
        }

        console.log(data);

        switch (data.endpoint) {
            case 'server/user/connect': {
                if (!isValidConnection(data)) {
                    return;
                }

                data.address = addressToIP(data.address);

                Promise.all([
                    saveUser(data),
                    saveGlobalUser(data)
                ]).then(() => {
                    console.log(`User Saved: ${data.steam}`);
                }).catch((err) => {
                    console.log(err);
                });

                break;
            }

            case 'server/user/disconnect': {
                if (!isValidDisconnection(data)) {
                    return;
                }

                Promise.all([
                    // saveDisconnect(data),
                    saveUserSession(data)
                ]).then(() => {
                    console.log(`User Session Saved: ${data.steam}`);
                }).catch((err) => {
                    console.log(err);
                });

                break;
            }

            default:
                break;
        }
    });
    */

    connection.query('SELECT * FROM users', (err, results) => {
        if (err) {
            console.log(err);
            return;
        }

        results.forEach((user) => {
            const ips = JSON.parse(user.IPS || '[]');
            // if ips contain null remove it
            if (ips.includes(null)) {
                ips.splice(ips.indexOf(null), 1);
            }

            connection.query('UPDATE users SET IPS = ? WHERE steamID64 = ?', [JSON.stringify(ips), user.steamID64], (err) => {
                if (err) {
                    console.log(err);
                } else {
                    console.log(`Formatted user ${user.steamID64} with name ${user.name}`);
                }
            });
        });
    });
});