const {generateToken} = require("../../utils/tools");
const fs = require("fs");
const {
    domain
} = require("../../config");

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
                console.log(err);
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

module.exports = {
    saveScreenshot
};