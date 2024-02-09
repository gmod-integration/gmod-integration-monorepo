const userModel = require('../../models/v2/userModel');
const {badArgument, ipGetIP} = require('../../utils/tools');

function getUser(req, res) {
    const {id} = req.headers;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const {steamID64} = req.query;

    if (badArgument([steamID64])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64
            }
        });
    }

    userModel.getUserServerData(id, steamID64, ip).then((data, banReason) => {
        if (!data) {
            return res.status(200).json(
                {
                    error: 'user_not_found',
                    discord_ban: !!banReason,
                    discord_ban_reason: banReason ? banReason : null,
                }
            );
        } else {
            return res.status(200).json({
                discord_ban: !!banReason,
                discord_ban_reason: banReason ? banReason : null,
                id: data.id,
                steam: data.steam,
                username: data.username,
                rank: data.rank,
                last_oauth: data.last_oauth,
                trust: data.trust
            });
        }
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'})
    });
}

function getUserIsLinked(req, res) {
    const {discordID, steamID64} = req.query;

    userModel.getUserData(discordID, steamID64).then((result) => {
        if (result.length === 0) {
            res.status(200).json({isLinked: false});
        } else {
            res.status(200).json({isLinked: true});
        }
    }).catch((err) => {
        console.log(err);
        res.status(500).json({error: 'internal_server_error'});
    });
}

function postUserSay(req, res) {
    const {id} = req.headers;
    let {steamID64, message, name} = req.body;

    if (badArgument([steamID64, message, name])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steamID64: !!steamID64,
                message: !!message,
                name: !!name,
            }
        });
    }

    userModel.addUserSay(steamID64, message, name, id).then(() => {
        return res.status(200).json({message: 'data_received'});
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

function postUserConnect(req, res) {
    const {id} = req.headers;
    const {address, name, networkid, steam} = req.body;

    if (badArgument([address, name, networkid, steam])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                address: !!address,
                name: !!name,
                networkid: !!networkid,
                steam: !!steam,
            }
        });
    }

    const ip = ipGetIP(address);

    userModel.addUserSteam(steam, networkid, name, ip, id).then(() => {
        return res.status(200).send('User Added');
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'})
    });
}

function postUserDisconnect(req, res) {
    const {id} = req.headers;
    let {steam, kills, deaths, rank, customValues, time} = req.body;

    if (badArgument([steam, kills, deaths, rank])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steam: !!steam,
                kills: !!kills,
                deaths: !!deaths,
                rank: !!rank,
            }
        });
    }

    const userData = {
        rank: rank,
        time: time,
        kills: kills,
        deaths: deaths,
        customValues: customValues,
    };

    Promise.all([
        userModel.postUserStatDisconnect(id, steam, userData),
        userModel.postSaveUserSession(id, steam, userData)
    ]).then(() => {
        return res.status(200).json({message: 'data_received'});
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'});
    });
}

function postUserFinishConnect(req, res) {
    const {guild, id} = req.headers;
    const {steam, name} = req.body;

    if (badArgument([steam, name])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steam: !!steam,
                name: !!name,
            }
        });
    }

    userModel.addUserServerConnect(guild, id, steam, name).then(() => {
        return res.status(200).send('data received');
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'})
    });
}

function postUserChangeName(req, res) {
    const {guild, id} = req.headers;
    const {steamID64, oldName, newName} = req.body;

    if (badArgument([steamID64, oldName, newName])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                steam: !!steamID64,
                oldName: !!oldName,
                newName: !!newName,
            }
        });
    }

    userModel.addUserServerConnect(guild, id, steamID64, newName).then(() => {
        return res.status(200).send('data received');
    }).catch((err) => {
        console.log(err);
        return res.status(500).json({error: 'internal_server_error'})
    });
}

function postUserKick(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

function postUserWarn(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

function postUserUnwarn(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

function postUserMute(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

function postUserUnmute(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

function postUserBan(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

function postUserUnban(req, res) {
    // TODO
    return res.status(200).json({message: 'Not Implemented'});
}

module.exports = {
    getUser,
    getUserIsLinked,
    postUserSay,
    postUserConnect,
    postUserDisconnect,
    postUserFinishConnect,
    postUserChangeName,
    postUserKick,
    postUserWarn,
    postUserUnwarn,
    postUserMute,
    postUserUnmute,
    postUserBan,
    postUserUnban,
};