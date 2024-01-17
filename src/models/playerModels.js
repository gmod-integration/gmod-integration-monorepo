const fs = require('fs');

function postScreenshot(id, screenshot, steamID64, options) {
    return new Promise((resolve, reject) => {
        // Define the format and the filename
        const format = options.format || 'png';
        const filename = `${steamID64}-${Date.now()}.${format}`;
        const path = `./screenshots/${filename}`;

        // Remove the Base64 prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        // Decode the Base64 string to binary data
        const buffer = Buffer.from(base64Data, 'base64');

        // Write the data to a file
        fs.writeFile(path, buffer, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve({ path, filename });
        });
    });
}

module.exports = {
    postScreenshot
};
