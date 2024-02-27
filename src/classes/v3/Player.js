const {getConnection} = require('../../database/connection');
const BaseClass = require('./BaseClass');
const CustomValues = require('./CustomValues');

class Player extends BaseClass {
    constructor(obj = {}) {
        super();
        this.steamID64 = obj.steamID64;
        this.customValues = new CustomValues(obj.customValues);
        this.lastConnection = obj.lastConnection;
        this.kills = obj.kills;
        this.deaths = obj.deaths;
        this.playTime = obj.playTime;
        this.rank = obj.rank;
        this.name = obj.name;
    }
}

function getServerPlayer(serverID, steamID64) {
    return new Promise(async (resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server_stat WHERE server_id = ? AND steam_id = ?', [serverID, steamID64], (error, results) => {
                if (results.length > 0) {
                    return resolve(new Player({
                        steamID64: results[0].steam_id,
                        customValues: JSON.parse(results[0].custom_values),
                        lastConnection: results[0].last_connect,
                        kills: results[0].total_kill,
                        deaths: results[0].total_death,
                        playTime: results[0].total_time,
                        rank: results[0].rank,
                        name: results[0].name
                    }));
                }
                return reject('Player not found');
            });
        });
    });
}

module.exports = {
    Player,
    getServerPlayer
};