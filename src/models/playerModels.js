const fs = require('fs');
const axios = require('axios');
const {generateToken} = require("../utils/tools");
const {steamAPI} = require("../config");
const steamApi = require('steamapi');
const steam = new steamApi(steamAPI);

function postScreenshot(id, screenshot, steamID64, options, host, name) {
    return new Promise(async (resolve, reject) => {
        // Define the format and the filename
        const format = options.format || 'png';
        const filename = generateToken(32) + '.' + format;
        const path = `./screenshots/${filename}`;

        const summary = await steam.getUserSummary(steamID64);
        const avatarUrl = summary.avatar.large;

        const embed = {
            "embeds": [
                {
                    // "title": "New Screenshot",
                    // "description": "A new screenshot has been uploaded",
                    "image": {
                        "url": `https://${host}/screenshots/${filename}`
                    }
                }
            ],
            "username": name || summary.nickname,
            "avatar_url": avatarUrl,
        };

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

            axios.post('https://discord.com/api/webhooks/1197017805430730873/Lw9U1HtbJgd4pEnVUmTkJOTVbkLcrA8oTQZe2t1TGtWSDM08P_wmFIKbYPwBfD7sH5l2', embed).then(function (response) {
                resolve({path, filename});
            }).catch(function (error) {
                console.log(error);
                reject(error);
            });
        });
    });
}

module.exports = {
    postScreenshot
};
