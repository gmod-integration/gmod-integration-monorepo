//
// Variables Declaration & Libraries Import
//

// Configuration Variables
const { port_api, dbConfig, token } = require('../config.json');

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
const { connect } = require('http2');

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

function badArgument(list) {
    for (let i = 0; i < list.length; i++) {
        if (list[i] === undefined) {
            return true;
        }
    }
    return false;
}

function addTodoTask(task, data) {
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_todo_task (task, data) VALUES (?, ?)', [task, data], (error) => {
            if (error) throw error;
        });
    });
}

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

function ipGetPort(ip) {
    if (!ip || typeof ip !== 'string' || ip.length === 0) {
        return '';
    }
    return ip.split(':')[1];
}

function ipGetIP(ip) {
    if (!ip || typeof ip !== 'string' || ip.length === 0) {
        return '';
    }
    return ip.split(':')[0];
}

function checkMissingArgs(requiredArgs, location) {
    return function (req, res, next) {
        const missingArgs = [];

        requiredArgs.forEach((arg) => {
            let value;
            switch (location) {
                case 'body':
                    value = req.body[arg];
                    break;
                case 'header':
                    value = req.headers[arg.toLowerCase()];
                    break;
                case 'query':
                    value = req.query[arg];
                    break;
                default:
                    value = undefined;
            }
            if (value === undefined || value === null) {
                missingArgs.push(arg);
            }
        });

        if (missingArgs.length > 0) {
            return res.status(400).json({ message: `Missing arguments: ${missingArgs.join(', ')}` });
        }

        next();
    }
}

//
// Express App
//

const app = express();

// Body Parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//
// Middleware
//

function validUserAgent(req, res, next) {
    const userAgent = req.headers['user-agent'];

    if (userAgent === 'Valve/Steam HTTP Client 1.0 (4000)') {
        next();
    } else {
        return res.redirect('https://gmod-integration.com');
    }
}

function retroConvertData(req, res, next) {
    const { id, token, version } = req.query;

    req.headers.id = req.headers.id || id;
    req.headers.token = req.headers.token || token;
    req.headers.version = req.headers.version || version;

    next();
}

function verifArgs(req, res, next) {
    const { id, token, version } = req.headers;

    if (badArgument([id, token, version])) {
        return res.status(400).json({ error: 'missing arguments id: ' + !!id + ', token: ' + !!token + ', version: ' + !!version });
    }

    next();
}

function validateAuth(req, res, next) {
    const { id, token } = req.headers;

    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) {
                gmLog('Error connecting to MySQL Database');
                console.error(err);
                return res.status(500).json({ error: 'internal server error' });
            }
            if (results.length > 0) {
                req.headers.guild = results[0].guild;
                next();
            } else {
                gmLog('Invalid auth, id or token not valid');
                return res.status(401).json({ error: 'invalid auth, id or token not valid' });
            }
        });
    });
}

app.use(validUserAgent, retroConvertData, verifArgs, validateAuth);

//
// Log
//

app.use((req, res, next) => {
    const method = req.method;
    const url = req.url;
    const body = JSON.stringify(req.body);
    const server = req.headers.id;

    gmLog("Method: " + method + ", URL: " + url + ", Body: " + body + ", Server: " + server);
    next();
});

//
// Functions
//

function postServerStatus(req, res) {
    const { id } = req.headers;
    let { players, maxplayers, map, hostname, gamemode, port, ip } = req.body;

    if (badArgument([players, maxplayers, map, hostname, gamemode, port, ip])) {
        return res.status(400).send('missing arguments players: ' + !!players + ', maxplayers: ' + !!maxplayers + ', map: ' + !!map + ', hostname: ' + !!hostname + ', gamemode: ' + !!gamemode + ', port: ' + !!port + ', ip: ' + !!ip);
    };

    ip = ipGetIP(ip);

    // save the server data to the database
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_server_status (id, ip, port, hostname, map, players, maxplayers, gamemode) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip = ?, port = ?, hostname = ?, map = ?, players = ?, maxplayers = ?, gamemode = ?, last_update = ?', [id, ip, port, hostname, map, players, maxplayers, gamemode, ip, port, hostname, map, players, maxplayers, gamemode, new Date()], (error) => {
            if (error) {
                console.error(error);
                return res.status(500).send('internal server error');
            }
            return res.status(200).send('data received');
        });
    });
}

function getServerAuth(req, res) {
    return res.status(200).json({ id: req.headers.id, version: req.headers.version });
}

function getServerGuild(req, res) {
    const { guild } = req.headers;

    return res.status(200).json({ guild: guild });
}

function postUserSay(req, res) {
    const { steamID64, message } = req.body;

    if (badArgument([steamID64, message])) {
        return res.status(400).send('missing arguments steamID64: ' + !!steamID64 + ', message: ' + !!message);
    }

    addTodoTask('userSay', JSON.stringify({
        steam_id: steamID64,
        message: message
    }));
}

function postUserConnect(req, res) {
    const { id } = req.headers;
    const { address, name, networkid, steam } = req.body;

    if (badArgument([address, name, networkid, steam])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', address: ' + !!address + ', name: ' + !!name + ', networkid: ' + !!networkid);
    }

    const ip = ipGetIP(address);

    getConnection().then(connection => {
        connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, last_ip = ?, total_connect = total_connect + 1', [steam, name, ip, name, ip], (error) => {
            if (error) throw error;
        });
        connection.query('INSERT INTO gm_server_stat (steam_id, server_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_connect = ?, total_connect = total_connect + 1', [steam, id, new Date()], (error) => {
            if (error) throw error;
        });
    });

    return res.status(200).send('data received');
}

function postUserFinishConnect(req, res) {
    const { guild, id } = req.headers;
    const { steam, name } = req.body;

    if (badArgument([steam, name])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', name: ' + !!name);
    }

    getConnection().then(connection => {
        // update gm_server_stat (name)
        connection.query('UPDATE gm_server_stat SET name = ? WHERE steam_id = ? AND server_id = ?', [name, steam, id], (error) => {
            if (error) throw error;
        });
        // insert or update the username in gm_user_username (discord_id, guild_id, steam_id, name)
        connection.query('SELECT * FROM gm_user WHERE steam = ?', [steam], (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                // add to todo list
                addTodoTask('updateUserName', JSON.stringify({
                    discord_id: results[0].id,
                    guild_id: guild,
                    steam_id: steam,
                    username: name
                }));
            }
        });
    });
    return res.status(200).send('data received');
};

function postUserChangeName(req, res) {
    postUserFinishConnect(req, res);
}

function postUserDisconnect(req, res) {
    const { id } = req.headers;
    const { steam, kills, deaths, money, rank } = req.body;

    if (badArgument([steam, kills, deaths, money, rank])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', kills: ' + !!kills + ', deaths: ' + !!deaths + ', money: ' + !!money + ', rank: ' + !!rank);
    }

    // limit money to 100 000 000 000
    if (money > 100000000000) {
        money = 100000000000;
    }

    // update the user data to the database (total_kill, total_deathn total_time) total_time = total_time + (curent timestamp - last_connect) in seconds after change last_connect to curent timestamp
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_server_stat (steam_id, server_id, total_kill, total_death, total_time, total_money, rank) VALUES (?, ?, ?, ?, TIMESTAMPDIFF(SECOND, last_connect, ?), ?, ?) ON DUPLICATE KEY UPDATE total_kill = total_kill + ?, total_death = total_death + ?, total_time = total_time + TIMESTAMPDIFF(SECOND, last_connect, ?), last_connect = ?, total_money = ?, rank = ?', [steam, id, kills, deaths, new Date(), money, rank, kills, deaths, new Date(), new Date(), money, rank], (error) => {
            if (error) throw error;
        });
        connection.query('INSERT INTO gm_user_steam (steam_id, total_kill, total_death, total_time) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_kill = total_kill + ?, total_death = total_death + ?, total_time = total_time + TIMESTAMPDIFF(SECOND, last_connect, ?), last_connect = ?', [steam, kills, deaths, 0, kills, deaths, new Date(), new Date()]);
    });
    return res.status(200).send('data received');
}

function postServerUserBan(req, res) {
    const { id } = req.headers;
    const { steam, duration, reason, by } = req.body;

    // TODO influence trust factor
    // save in bb

    getConnection().then(connection => {
        connection.query('INSERT INTO gm_server_ban (server, steam, duration, reason, by) VALUES (?, ?, ?, ?, ?)', [steam, id, duration, reason, by], (error) => {
            if (error) throw error;
        });
    });

    return res.status(200).send('data received');
}

function getServerUser(req, res) {
    const { id } = req.headers;
    const { steamID64 } = req.query;

    // get from db gm_user (discord_id, steam_id)
    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_user WHERE steam = ?', [steamID64], (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                // remove email
                delete results[0].email;
                // made a api request to discord to now if user is ban or not (/guilds/{guild.id}/bans/{user.id})
                connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results2) => {
                    if (error) throw error;
                    if (results2.length > 0) {
                        connection.query('SELECT * FROM banUsers WHERE steamID64 = ? OR discordID = ? OR ip = ?', [steamID64, results[0].id, ipGetIP(req.headers['x-forwarded-for'])], (error, results3) => {
                            if (error) throw error;
                            if (results3.length > 0) {
                                // user is ban
                                return res.status(200).json({ ban: true, ban_reason: results3[0].reason, ...results[0] });
                            } else {
                                // user is not ban
                                const guild = results2[0].guild;
                                request(`https://discord.com/api/guilds/${guild}/bans/${results[0].id}`, {
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bot ${token}`,
                                    },
                                }).then((userBanInfo) => {
                                    if (userBanInfo.statusCode === 200) {
                                        // user is ban
                                        return res.status(200).json({ discord_ban: true, discord_ban_reason: userBanInfo.body.reason, ...results[0] });
                                    } else if (userBanInfo.statusCode === 404) {
                                        // user is not ban
                                        return res.status(200).json({ discord_ban: false, ...results[0] });
                                    } else {
                                        // error
                                        return res.status(200).json({ error: 'discord api error' });
                                    }
                                });
                            }
                        });
                    } else {
                        // error
                        return res.status(200).json({ error: 'server not found' });
                    }
                });
            } else {
                // user not found
                return res.status(200).json({ error: 'user not found' });
            }
        });
    });
}

function postServerShutdown(req, res) {
    const { id } = req.headers;

    // TODO

    return res.status(200).send('data received');
}

function postServerChangeLevel(req, res) {
    const { id } = req.headers;
    const { map } = req.body;

    if (badArgument([map])) {
        return res.status(400).send('missing arguments map: ' + !!map);
    }

    // TODO

    return res.status(200).send('data received');
}

function postServerChangeGamemode(req, res) {
    const { id } = req.headers;
    const { gamemode } = req.body;

    if (badArgument([gamemode])) {
        return res.status(400).send('missing arguments gamemode: ' + !!gamemode);
    }

    // TODO

    return res.status(200).send('data received');
}

function postServerStart(req, res) {
    const { id } = req.headers;

    // TODO

    return res.status(200).send('data received');
}

//
// New API
//

app.get('/server/auth', getServerAuth);
app.get('/server/guild', getServerGuild);
app.post('/server/status', postServerStatus);
app.get('/server/user', checkMissingArgs(['steamID64'], 'query'), getServerUser);
app.post('/server/user/ban', checkMissingArgs(['steamid', 'duration', 'reason', 'by'], 'body'), postServerUserBan);
app.post('/server/user/say', postUserSay);
app.post('/server/user/connect', postUserConnect);
app.post('/server/user/finishConnect', postUserFinishConnect);
app.post('/server/user/changeName', postUserChangeName);
app.post('/server/user/disconnect', postUserDisconnect);
app.post('/server/shutdown', postServerShutdown);
app.post('/server/changeLevel', postServerChangeLevel);
app.post('/server/changeGamemode', postServerChangeGamemode);
app.post('/server/start', postServerStart);

//
// Public API
//

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

//
// Retro Compatibility
//

const postFuncs = {
    tryConfig: getServerGuild,
    userConnect: postUserConnect,
    userFinishConnect: postUserFinishConnect,
    userChangeName: postUserChangeName,
    userDisconnect: postUserDisconnect,
    serverStatus: postServerStatus
};

app.post('/', express.json(), (req, res, next) => {
    const { id, guild } = req.headers;
    const request = req.query.request;

    // if the request is valid execute the function else reply by not found
    if (postFuncs[request]) {
        postFuncs[request](req, res, guild, id);
    } else {
        next();
    }
});

// for other method replace by 404
app.all('*', (req, res) => {
    return res.status(404).json({ error: '404 Not Found' });
});

// Start the server
app.listen(port_api, () => gmLog(`Server listening on port ${port_api}`));
