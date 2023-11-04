const userModel = require('../models/userModel');
const { badArgument, ipGetIP } = require('../utils/tools');

function getUser(req, res) {
    const { id } = req.headers;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const { steamID64 } = req.query;

    if (badArgument([steamID64])) {
        return res.status(400).send('missing arguments steam: ' + !!steamID64);
    }

    userModel.getUserServerData(id, steamID64, ip).then((data, banReason) => {
        return res.status(200).json({
            discord_ban: banReason ? true : false,
            id: data.id,
            steam: data.steam,
            username: data.username,
            rank: data.rank,
            last_oauth: data.last_oauth,
            trust: data.trust
        });
    }).catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'Internal server error' });
    });
}

function getUserIsLinked(req, res) {
    const { discordID, steamID64 } = req.query;

    userModel.getUserData(discordID, steamID64).then((result) => {
        if (result.length === 0) {
            res.status(200).json({ isLinked: false });
        } else {
            res.status(200).json({ isLinked: true });
        }
    }).catch((err) => {
        console.log(err);
        res.status(500).json({ error: 'Internal server error' });
    });
}

function postUserSay(req, res) {
    const { id } = req.headers;
    let { steamID64, message, name } = req.body;

    if (badArgument([steamID64, message, name])) {
        return res.status(400).send('missing arguments steam: ' + !!steamID64 + ', message: ' + !!message + ', name: ' + !!name);
    }

    userModel.addUserSay(steamID64, message, name, id).then(() => {
        return res.status(200).send('data received');
    }).catch((err) => {
        console.log(err);
        return res.status(500).send('Internal Server Error');
    });
}

function postUserConnect(req, res) {
    const { id } = req.headers;
    const { address, name, networkid, steam } = req.body;

    if (badArgument([address, name, networkid, steam])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', address: ' + !!address + ', name: ' + !!name + ', networkid: ' + !!networkid);
    }

    const ip = ipGetIP(address);

    userModel.addUserSteam(steam, name, ip).then(() => {
        userModel.addUserServerStat(steam, id).then(() => {
            return res.status(200).send('User Added');
        }).catch((err) => {
            console.log(err);
            return res.status(500).send('Internal Server Error');
        });
    }).catch((err) => {
        console.log(err);
        return res.status(500).send('Internal Server Error');
    });
}

function postUserDisconnect(req, res) {
    const { id } = req.headers;
    let { steam, kills, deaths, money, rank } = req.body;

    if (badArgument([steam, kills, deaths, money, rank])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', kills: ' + !!kills + ', deaths: ' + !!deaths + ', money: ' + !!money + ', rank: ' + !!rank);
    }

    money = (parseInt(money) || 0) > 1000000000;

    userModel.addUserServerStat(steam, id, kills, deaths, money, rank).then(() => {
        return res.status(200).send('User Updated');
    }).catch((err) => {
        console.log(err);
        return res.status(500).send('Internal Server Error');
    });
}

function postUserFinishConnect(req, res) {
    const { guild, id } = req.headers;
    const { steam, name } = req.body;

    if (badArgument([steam, name])) {
        return res.status(400).send('missing arguments steam: ' + !!steam + ', name: ' + !!name);
    }

    userModel.addUserServerConnect(guild, id, steam, name).then(() => {
        return res.status(200).send('data received');
    }).catch((err) => {
        console.log(err);
        return res.status(500).send('Internal Server Error');
    });
}

function postUserChangeName(req, res) {
    postUserFinishConnect(req, res);
}

function postUserKick(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserWarn(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserUnwarn(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserMute(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserUnmute(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserBan(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserUnban(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
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