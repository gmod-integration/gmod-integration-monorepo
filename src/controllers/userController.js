const userModel = require('../models/userModel');

function getUser(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function getUserIsLinked(req, res) {
    const { discordID, steamID64 } = req.query;

    userModel.getUserData(discordID, steamID64)
        .then((result) => {
            if (result.length === 0) {
                res.status(200).json({ isLinked: false });
            } else {
                res.status(200).json({ isLinked: true });
            }
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ error: 'Internal server error' });
        });
}

function postUserSay(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserConnect(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserDisconnect(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserFinishConnect(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
}

function postUserChangeName(req, res) {
    // TODO
    return res.status(200).json({ message: 'Not Implemented' });
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