const {getConnection} = require("../../database/connection");

async function isGuildPremium(guildID) {
    return new Promise((resolve, reject) => {
        getConnection().then(connection => {
            connection.query('SELECT * FROM gm_premium WHERE guild = ?', [guildID], (error, results) => {
                if (error) return reject(error);
                resolve(results.length > 0);
            });
        });
    });
}

module.exports = {
    isGuildPremium
}