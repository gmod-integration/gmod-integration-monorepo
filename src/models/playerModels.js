const fs = require('fs');
const axios = require('axios');
const {generateToken} = require("../utils/tools");
const {steamAPI} = require("../config");
const steamApi = require('steamapi');
const {getConnection} = require("../database/connection");
const steam = new steamApi(steamAPI);

function getSteamProfile(steamID64) {
    return new Promise((resolve, reject) => {
        steam.getUserSummary(steamID64).then((summary) => {
            resolve(summary);
        }).catch((err) => {
            reject(err);
        });
    });
}

function saveScreenshot(id, screenshot, steamID64, options) {
    return new Promise(async (resolve, reject) => {
        // Define the format and the filename
        const format = options.format || 'png';
        const filename = `${new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-').replace(/T/g, '_')}_${steamID64}_${generateToken(8)}.${format}`;
        const path = `./screenshots/${filename}`;

        // Remove the Base64 prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        // Decode the Base64 string to binary data
        const buffer = Buffer.from(base64Data, 'base64');

        // Write the data to a file
        fs.writeFile(path, buffer, (err) => {
            if (err) {
                console.log(err);
                reject(err);
            }

            resolve({path, filename});
        });
    });
}

function getScreenshotsChannels(serverID) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server_screenshot_channels WHERE serverID = ?', [serverID], (error, results) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        }).catch((err) => {
            console.log(err);
            reject(err);
        });
    });
}

function postScreenshot(webhookID, webhookToken, playerName, avatarUrl, screenshotUrl) {
    return new Promise(async (resolve, reject) => {
        const embed = {
            "embeds": [
                {
                    // "title": "New Screenshot",
                    // "description": "A new screenshot has been uploaded",
                    "image": {
                        "url": avatarUrl,
                    }
                }
            ],
            "username": playerName,
            "avatar_url": avatarUrl,
        };

        axios.post(`https://discord.com/api/webhooks/${webhookID}/${webhookToken}`, embed).then(function (response) {
            resolve();
        }).catch(function (error) {
            reject(error);
        });
    });
}

module.exports = {
    postScreenshot,
    saveScreenshot,
    getSteamProfile,
    getScreenshotsChannels,
};
