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

//
// Middleware
//

function validUserAgent(req, res, next) {
    const userAgent = req.headers['user-agent'];

    if (userAgent === 'Valve/Steam HTTP Client 1.0 (4000)') {
        next();
    } else {
        res.redirect('https://gmod-integration.com');
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
        console.log('missing arguments id: ' + id + ', token: ' + token + ', version: ' + version);
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
                return res.status(401).json({ error: 'invalid auth, id or token not valid' });
            }
        });
    });
}

app.use(validUserAgent);
app.use(retroConvertData);
app.use(verifArgs);
app.use(validateAuth);

// test
app.get('/auth', (req, res) => {
    res.status(200).json({ success: true });
});

//
// Functions
//

function postServerStatus(req, res) {
    const { id } = req.headers;
    let { players, maxplayers, map, hostname, gamemode, port, ip } = req.body;

    if (badArgument([players, maxplayers, map, hostname, gamemode, port, ip])) {
        res.status(400).send('missing arguments players: ' + !!players + ', maxplayers: ' + !!maxplayers + ', map: ' + !!map + ', hostname: ' + !!hostname + ', gamemode: ' + !!gamemode + ', port: ' + !!port + ', ip: ' + !!ip);
        return;
    };

    ip = ipGetIP(ip);

    // save the server data to the database
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_server_status (id, ip, port, hostname, map, players, maxplayers, gamemode) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip = ?, port = ?, hostname = ?, map = ?, players = ?, maxplayers = ?, gamemode = ?, last_update = ?', [id, ip, port, hostname, map, players, maxplayers, gamemode, ip, port, hostname, map, players, maxplayers, gamemode, new Date()], (error) => {
            if (error) {
                console.error(error);
                res.status(500).send('internal server error');
                return;
            }
            res.status(200).send('data received');
        });
    });
}

function getServerGuild(req, res) {
    const { guild } = req.headers;

    res.status(200).json({ guild: guild });
}

function postUserSay(req, res) {
    const { steamID64, message } = req.body;

    if (badArgument([steamID64, message])) {
        res.status(400).send('missing arguments steamID64: ' + !!steamID64 + ', message: ' + !!message);
        return;
    }

    addTodoTask('userSay', JSON.stringify({
        steam_id: steamID64,
        message: message
    }));
}

function postUserConnect(req, res) {
    const { id } = req.headers;
    const { steam, ip, username } = req.body;

    if (badArgument([steam, ip, username])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', ip: ' + !!ip + ', username: ' + !!username);
    }

    getConnection().then(connection => {
        connection.query('INSERT INTO gm_user_steam (steam_id, username, last_ip) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, last_ip = ?, total_connect = total_connect + 1', [steam, username, ip, username, ip], (error) => {
            if (error) throw error;
        });
        connection.query('INSERT INTO gm_server_stat (steam_id, server_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_connect = ?, total_connect = total_connect + 1', [steam, id, new Date()], (error) => {
            if (error) throw error;
        });
        res.status(200).send('data received');
    });
}

function postUserFinishConnect(req, res) {
    const { guild, id } = req.headers;
    const { steam, rp_name } = req.body;

    if (badArgument([steam, rp_name])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', rp_name: ' + !!rp_name);
    }

    getConnection().then(connection => {
        // update gm_server_stat (name)
        connection.query('UPDATE gm_server_stat SET name = ? WHERE steam_id = ? AND server_id = ?', [rp_name, steam, id], (error) => {
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

    // update the user data to the database (total_kill, total_deathn total_time) total_time = total_time + (curent timestamp - last_connect) in seconds after change last_connect to curent timestamp
    getConnection().then(connection => {
        connection.query('INSERT INTO gm_server_stat (steam_id, server_id, total_kill, total_death, total_time, total_money, rank) VALUES (?, ?, ?, ?, TIMESTAMPDIFF(SECOND, last_connect, ?), ?, ?) ON DUPLICATE KEY UPDATE total_kill = total_kill + ?, total_death = total_death + ?, total_time = total_time + TIMESTAMPDIFF(SECOND, last_connect, ?), last_connect = ?, total_money = ?, rank = ?', [steam, id, kills, deaths, new Date(), money, rank, kills, deaths, new Date(), new Date(), money, rank], (error) => {
            if (error) throw error;
        });
        connection.query('INSERT INTO gm_user_steam (steam_id, total_kill, total_death, total_time) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_kill = total_kill + ?, total_death = total_death + ?, total_time = total_time + TIMESTAMPDIFF(SECOND, last_connect, ?), last_connect = ?', [steam, kills, deaths, 0, kills, deaths, new Date(), new Date()]);
    });
    res.status(200).send('data received');
}

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

app.post('/', express.json(), (req, res) => {
    const { id, guild } = req.headers;
    const request = req.query.request;

    // if the request is valid execute the function else reply by not found
    if (postFuncs[request]) {
        console.log('request: ' + request + ', id: ' + id + ', guild: ' + guild);
        postFuncs[request](req, res, guild, id);
    }
});

//
// New API
//

app.get('/server/guild', getServerGuild);
app.post('/server/status', postServerStatus);
app.post('/server/user/say', postUserSay);
app.post('/server/user/connect', postUserConnect);

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

// for other method replace by 404
app.all('*', (req, res) => {
    return res.status(404).json({ error: '404 Not Found' });
});

// Start the server
app.listen(port_api, () => gmLog(`Server listening on port ${port_api}`));
