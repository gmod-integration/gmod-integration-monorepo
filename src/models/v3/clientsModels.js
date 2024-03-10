const {generateToken} = require("../../utils/tools");
const fs = require("fs");
const {
    domain
} = require("../../config");
const {WebhookClient} = require("discord.js");
const steam = require("../../steam");

function saveScreenshot(screenshot, captureData, player) {
    return new Promise(async (resolve, reject) => {
        const format = captureData.format || 'jpeg';
        const dateFormatted = new Date().toISOString().replace(/T/g, '_').replace(/\..+/, '').replace(/:/g, '-');
        const filename = `${dateFormatted}_${player.steamID64}_${generateToken(8)}.${format}`;

        const path = `./screenshots/${filename}`;
        const url = `${domain}/screenshots/${filename}`;

        // Remove the Base64 prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        // Decode the Base64 string to binary data
        const buffer = Buffer.from(base64Data, 'base64');

        // Write the data to a file
        fs.writeFile(path, buffer, (err) => {
            if (err) {
                reject(err);
            }

            resolve({
                path,
                filename,
                url
            });
        });
    });
}

function sendScreenshotToDiscord(screenshot, player, server) {
    return new Promise(async (resolve, reject) => {
        const channelInfo = await server.getScreenshotsChannel();
        if (!channelInfo) {
            return reject('channel_not_found');
        }

        const webhookClient = new WebhookClient({
            id: channelInfo.webhook,
            token: channelInfo.token
        });

        // webhookClient.send({
        //     content: `New screenshot from ${player.name} (${player.steamID64})`,
        //     files: [screenshot.path]
        // }).then(() => {
        //     resolve();
        // }).catch((err) => {
        //     reject(err);
        // });

        // use embed
        const embed = {
            title: `New screenshot from ${player.name} (${player.steamID64})`,
            image: {
                url: screenshot.url
            }
        };

        webhookClient.send({
            embeds: [embed]
        }).then(() => {
            resolve();
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    saveScreenshot,
    sendScreenshotToDiscord
};