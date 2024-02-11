const steamApi = require('steamapi');
const {steamAPI} = require("../config");

const steam = new steamApi(steamAPI);

function getSteamApi() {
    return steam;
}

module.exports = {
    getSteamApi
}