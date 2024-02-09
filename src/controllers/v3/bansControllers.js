const bansModels = require('../../models/v3/bansModels');
const {ipGetIP} = require("../../utils/tools");

async function isGlobalBanSomewhere(req, res) {
    const {steamID64, IP, discordID} = req.query;
    return res.status(200).json(await bansModels.isGlobalBan(IP && ipGetIP(IP), discordID, steamID64))
}

module.exports = {
    isGlobalBanSomewhere
}