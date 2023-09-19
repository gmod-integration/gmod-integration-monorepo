//
// Variables Declaration & Libraries Import
//

// Configuration Variables
const { port_api, dbConfig } = require('../config.json');

// HTTP Requests
const { request } = require('undici');
const express = require('express');

// Body Parser
const bodyParser = require('body-parser');

// MySQL Database
const mysql = require('mysql');

// Path
const path = require('path');

// File System
const fs = require('fs');

function gmLog(message) {
    // log format: [2023-07-10 04:28:25] [INFO]
    console.log('[' + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + '] [INFO] ' + message);
}

//
// MySQL Database
//

let connection;

// create func how return connection, if connection is not alive, create new connection
function getConnection() {
    return new Promise((resolve, reject) => {
        if (connection && connection.state !== 'disconnected') {
            resolve(connection);
        } else {
            connection = mysql.createConnection(dbConfig);
            connection.connect((err) => {
                if (err) {
                    gmLog('Error connecting to MySQL Database');
                    console.error(err);
                    reject(err);
                } else {
                    gmLog('Connected to MySQL Database');
                    // Keep connection alive by pinging every 60 seconds
                    setInterval(() => {
                        connection.ping();
                    }, 60000);
                    resolve(connection);
                }
            });
        }
    });
}

// Init connection
getConnection();

//
// Functions
//

function clearString(varString, alter) {
    if (typeof varString !== 'string') {
        return alter || '';
    } else if (varString.length === 0) {
        return alter || '';
    }
    // Inclure tous les caractères alphanumériques, les opérateurs mathématiques et les caractères utilisés pour les URL
    let new_var = varString.replace(/[^a-zA-Z0-9.:+\-*/=^%?&#!~_ ]/g, '');
    if (new_var.length === 0) {
        new_var = alter || '';
    }
    return new_var;
}

function removePort(ip) {
    if (!ip || typeof ip !== 'string' || ip.length === 0) {
        return '';
    }
    return ip.split(':')[0];
}

//
// Express App
//

const app = express();

// Body Parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Whitelist Requests
function isSkipRequest(request) {
    if (request === 'generate') {
        return true;
    }
    return false;
}

function tokenIsValid(token, id, request, callback) {
    // if the request is skipable skip the verification
    if (isSkipRequest(request)) {
        callback(true);
        return;
    }
    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                callback(results[0].guild, results[0].id);
            } else {
                callback(false);
            }
        });
    });
}

// valid request & as autorisation
function validRequest(req, res, callback) {
    // check the user-agent need to be Garry's Mod
    if (req.headers['user-agent'] !== 'Valve/Steam HTTP Client 1.0 (4000)') {
        res.status(401).send('user-agent not valid');
        callback(false);
        return;
    }

    // get arguments from the url
    const { id, token, request, version } = req.query;

    // check if the url contain required arguments (id, token, request, version)
    if (!id || !token || !request || !version) {
        res.status(400).send('missing arguments id: ' + !!id + ', token: ' + !!token + ', request: ' + !!request + ', version: ' + !!version);
        callback(false);
        return;
    }

    // check if the token is valid
    tokenIsValid(token, id, request, (guild, id) => {
        if (!guild) {
            res.status(401).send('token not valid');
            callback(false);
        } else {
            callback(guild, id);
        }
        // log request gm_log_api(id, request, valid, is_post, value)
        const valid = guild ? 'true' : 'false';
        gmLog('Request from server: ' + id + ' (' + req.headers['x-forwarded-for'] + ') request: ' + request + ' valid: ' + valid + ' content: ' + JSON.stringify(req.body));
    });
}

function serverGenerateToken(length) {
    // generate a random token with the length A-Z a-z 0-9
    let token = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        token += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    getConnection().then(connection => {
        // verify if the token is not already used (table: gm_server_generate)
        connection.query('SELECT * FROM gm_server_generate WHERE token = ?', [token], (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                // token already used
                serverGenerateToken(length);
            }
        });
    });
    return token;
}


function saveNewServerGenerate(token, ip, port, name) {
    getConnection().then(connection => {
        // save the new server (table: gm_server_generate)
        connection.query('INSERT INTO gm_server_generate (token, ip, port, name) VALUES (?, ?, ?, ?)', [token, ip, port, name], (error) => {
            if (error) throw error;
        });
    });
}

// Custom API (Fetch)
app.get('/api', (req, res) => {
    // check if the request is valid if not cancel the request
    validRequest(req, res, (valid, guild) => {
        if (!valid) return;

        // extract element from the query (id, token, request)
        const { id, token, request } = req.query;

        if (request === 'all_good') {
            res.status(200).send('all good');
        } else {
            // remply by all good
            res.status(404).send('request not found');
        }
    });
});

/*
Database Structure
    gm_user_steam(steam_id, username, last_ip, last_connect, total_time, total_death, total_kill) last_connect = curent timestamp
*/

function addTodoTask(task, data) {
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_todo_task (task, data) VALUES (?, ?)', [task, data], (error) => {
            if (error) throw error;
        });
    });
}

// Function of the post request
const postFuncs = {
    tryConfig: (req, res, guild, server_id) => {
        res.status(200).send(guild);
    },
    generate: (req, res, guild, server_id) => {
        const ip = clearString("" + removePort(req.body.ip));
        const port = clearString("" + req.body.port);
        const name = clearString("" + req.body.name);

        // check if the ip, port and name are valid
        if (!ip || !port || !name) {
            // missing arguments
            res.status(400).send('missing arguments');
            return;
        } else {
            const genToken = serverGenerateToken(16);
            saveNewServerGenerate(genToken, ip, port, name);
            res.status(200).send(genToken);
        }
    },
    userConnect: (req, res, guild, server_id) => {
        const steam = clearString("" + req.body.steam);
        const ip = clearString("" + removePort(req.body.address));
        const username = clearString("" + req.body.name);

        if (!ip || !steam || !username) {
            res.status(400).send('missing arguments');
            return;
        }

        getConnection().then(connection => {
            connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, last_ip = ?, total_connect = total_connect + 1', [steam, username, ip, username, ip], (error) => {
                if (error) throw error;
            });
            connection.query('INSERT INTO gm_server_stat (steam_id, server_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_connect = ?, total_connect = total_connect + 1', [steam, server_id, new Date()], (error) => {
                if (error) throw error;
            });
        });
        res.status(200).send('data received');
    },
    userFinishConnect: (req, res, guild, server_id) => {
        const steam = clearString("" + req.body.steam);
        const rp_name = clearString("" + req.body.name);

        if (!steam || !rp_name) {
            // missing arguments
            res.status(400).send('missing arguments');
            return;
        }

        getConnection().then(connection => {
            // update gm_server_stat (name)
            connection.query('UPDATE gm_server_stat SET name = ? WHERE steam_id = ? AND server_id = ?', [rp_name, steam, server_id], (error) => {
                if (error) throw error;
            });
            // insert or update the username in gm_user_username (discord_id, guild_id, steam_id, rp_name)
            connection.query('SELECT * FROM gm_user WHERE steam = ?', [steam], (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    // add to todo list
                    addTodoTask('updateUserName', JSON.stringify({
                        discord_id: results[0].id,
                        guild_id: guild,
                        steam_id: steam,
                        username: rp_name
                    }));
                }
            });
        });
        res.status(200).send('data received');
    },
    userChangeName: (req, res, guild, server_id) => {
        // get variables from the request
        const steam = clearString("" + req.body.steam);
        const rp_name = clearString("" + req.body.name);

        // check arguments are valid
        if (!steam || !rp_name) {
            // missing arguments
            res.status(400).send('missing arguments');
            return;
        }

        // save the user data to the database (last_connect = curent timestamp) and add the rp_name
        getConnection().then(connection => {
            connection.query('UPDATE gm_server_stat SET name = ? WHERE steam_id = ? AND server_id = ?', [rp_name, steam, server_id], (error) => {
                if (error) throw error;
            });
            connection.query('SELECT * FROM gm_user WHERE steam = ?', [steam], (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    // add to todo list
                    addTodoTask('updateUserName', JSON.stringify({
                        discord_id: results[0].id,
                        guild_id: guild,
                        steam_id: steam,
                        username: rp_name
                    }));
                }
            });
        });
        res.status(200).send('data received');
    },
    userDisconnect: (req, res, guild, server_id) => {
        // get variables from the request
        let { steam, kills, deaths, money, rank } = req.body;

        deaths = deaths || 0;
        kills = kills || 0;
        money = money || 0;

        if (money > 1000000000) {
            money = 1000000000;
        }

        // check arguments are valid if de
        if (!steam || !rank) {
            res.status(400).send('missing arguments: steam: ' + !!steam + ', kills: ' + !!kills + ', deaths: ' + !!deaths + ', money: ' + !!money + ', rank: ' + !!rank);
            return;
        }

        // update the user data to the database (total_kill, total_deathn total_time) total_time = total_time + (curent timestamp - last_connect) in seconds after change last_connect to curent timestamp
        getConnection().then(connection => {
            connection.query('INSERT INTO gm_server_stat (steam_id, server_id, total_kill, total_death, total_time, total_money, rank) VALUES (?, ?, ?, ?, TIMESTAMPDIFF(SECOND, last_connect, ?), ?, ?) ON DUPLICATE KEY UPDATE total_kill = total_kill + ?, total_death = total_death + ?, total_time = total_time + TIMESTAMPDIFF(SECOND, last_connect, ?), last_connect = ?, total_money = ?, rank = ?', [steam, server_id, kills, deaths, new Date(), money, rank, kills, deaths, new Date(), new Date(), money, rank], (error) => {
                if (error) throw error;
            });
            connection.query('INSERT INTO gm_user_steam (steam_id, total_kill, total_death, total_time) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_kill = total_kill + ?, total_death = total_death + ?, total_time = total_time + TIMESTAMPDIFF(SECOND, last_connect, ?), last_connect = ?', [steam, kills, deaths, 0, kills, deaths, new Date(), new Date()]);
        });
        res.status(200).send('data received');
    },
    serverStatus: (req, res, guild, server_id) => {
        // get variables from the request
        const players = req.body.players;
        const maxplayers = req.body.maxplayers;
        const map = req.body.map;
        const hostname = req.body.hostname;
        const gamemode = req.body.gamemode;
        const port = req.body.port;
        const ip = removePort(req.body.ip);

        // check arguments are valid
        if ((!players && !(players == 0)) || !maxplayers || !map || !hostname || !gamemode || !port || !ip) {
            res.status(400).send('missing arguments: players: ' + !!players + ', maxplayers: ' + !!maxplayers + ', map: ' + !!map + ', hostname: ' + !!hostname + ', gamemode: ' + !!gamemode + ', version: ' + ', port: ' + !!port + ', ip: ' + !!ip);
            return;
        }

        // save the server data to the database
        getConnection().then(connection => {
            connection.query('INSERT INTO gm_server_status (id, hostname, map, players, maxplayers, gamemode) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE hostname = ?, map = ?, players = ?, maxplayers = ?, gamemode = ?, last_update = ?', [server_id, hostname, map, players, maxplayers, gamemode, hostname, map, players, maxplayers, gamemode, new Date()], (error) => {
                if (error) throw error;
            });
        });
        res.status(200).send('data received');
    }
};

// Custom API (POST)
app.post('/', express.json(), (req, res) => {
    // check if the request is valid if not cancel the request
    validRequest(req, res, (guild, server_id) => {
        if (!guild) return;

        // extract the request from the query
        const request = req.query.request;

        // if the request is valid execute the function else reply by not found
        if (postFuncs[request]) {
            postFuncs[request](req, res, guild, server_id);
        } else {
            res.status(404).send('request not found');
        }
    });
});

function missingArguments(res, args) {
    let missingArgs = [];
    for (const arg in args) {
        // check is not undefined
        if (args[arg] === undefined) {
            missingArgs.push(arg);
        }
    }
    if (missingArgs.length > 0) {
        res.status(400).send(`Missing arguments: ${missingArgs.join(', ')}`);
        return missingArgs;
    }
    return false;
}

app.get('/user/isLinked', (req, res) => {
    // get variables from the url
    const { discordID, steamID64 } = req.query;
    // get from db gm_user (discord_id, steam_id)
    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_user WHERE id = ? OR steam = ?', [discordID, steamID64], (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                // reply in json if the user is linked
                res.status(200).json({ linked: true });
            } else {
                // reply in json if the user is not linked
                res.status(200).json({ linked: false });
            }
        });
    });
});

// redirect human to the website
app.use((req, res) => {
    res.status(404).send('not found');
});

// Start the server
app.listen(port_api, () => gmLog(`Server listening on port ${port_api}`));
