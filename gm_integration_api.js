function postUserSay(req, res) {
    const { id } = req.headers;
    let { steamID64, message, name } = req.body;

    // get user avatar from steam api
    getConnection().then(connection => {
        connection.query('SELECT * FROM gm_sync_chat WHERE server = ?', [id], async (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                steam.getUserSummary(steamID64).then(summary => {
                    request(results[0].webhook, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            content: message,
                            username: name || summary.nickname,
                            avatar_url: summary.avatar.large,
                        })
                    });
                });
            }
        });
    });

    return res.status(200).send('data received');
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
        connection.query(`UPDATE gm_server_stat SET total_kill = total_kill + ?, total_death = total_death + ?, total_time = CASE WHEN TIMESTAMPDIFF(SECOND, last_connect, ?) <= 86400 THEN total_time + TIMESTAMPDIFF(SECOND, last_connect, ?) ELSE total_time END, last_connect = ?, total_money = ?, rank = ?WHERE steam_id = ? AND server_id = ?`, [kills, deaths, new Date(), new Date(), new Date(), money, rank, steam, id], (error) => {
            if (error) {
                console.error(error);
                return res.status(500).send('internal server error');
            }
        });

        connection.query(`UPDATE gm_user_steam SET total_kill = total_kill + ?, total_death = total_death + ?, total_time = CASE WHEN TIMESTAMPDIFF(SECOND, last_connect, ?) <= 86400 THEN total_time + TIMESTAMPDIFF(SECOND, last_connect, ?) ELSE total_time END, last_connect = ?WHERE steam_id = ?`, [kills, deaths, new Date(), new Date(), new Date(), steam], (error) => {
            if (error) {
                console.error(error);
                return res.status(500).send('internal server error');
            }
        });

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


//
// New API
//

app.post('/server/status', (req, res) => {
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
});

app.get('/server/user', checkMissingArgs(['steamID64'], 'query'), getServerUser);
app.post('/server/user/ban', checkMissingArgs(['steamid', 'duration', 'reason', 'by'], 'body'), postServerUserBan);
app.post('/server/user/say', checkMissingArgs(['steamID64', 'message'], 'body'), postUserSay);
app.post('/server/user/connect', postUserConnect);
app.post('/server/user/finishConnect', postUserFinishConnect);
app.post('/server/user/changeName', postUserChangeName);
app.post('/server/user/disconnect', postUserDisconnect);

app.post('/server/shutdown', (req, res) => {

    const { id } = req.headers;

    // TODO

    return res.status(200).send('data received');
});

app.post('/server/changeLevel', (req, res) => {

    const { id } = req.headers;
    const { map } = req.body;

    if (badArgument([map])) {
        return res.status(400).send('missing arguments map: ' + !!map);
    }

    // TODO

    return res.status(200).send('data received');
});

app.post('/server/changeGamemode', (req, res) => {

    const { id } = req.headers;
    const { gamemode } = req.body;

    if (badArgument([gamemode])) {
        return res.status(400).send('missing arguments gamemode: ' + !!gamemode);
    }

    // TODO

    return res.status(200).send('data received');
});

app.post('/server/start', (req, res) => {

    const { id } = req.headers;

    // TODO

    return res.status(200).send('data received');
});
