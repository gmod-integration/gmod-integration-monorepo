const {getConnectionPromisse, getConnection} = require('../../database/connection');
const Team = require('./Team');
const Position = require('./Position');
const Angle = require('./Angle');
const BaseClass = require('./BaseClass');
const CustomValues = require('./CustomValues');

class PlayerGmod extends BaseClass {
    constructor(obj = {}) {
        super();
        this.steamID = obj.steamID;
        this.steamID64 = obj.steamID64;
        this.connectTime = obj.connectTime;
        this.kills = obj.kills;
        this.customValues = new CustomValues(obj.customValues);
        this.deaths = obj.deaths;
        this.team = new Team(obj.team);
        this.name = obj.name;
        this.userGroup = obj.userGroup;
        this.position = new Position(obj.position);
        this.angle = new Angle(obj.angle);
    }

    async getDiscordID() {
        try {
            const connection = await getConnectionPromisse(); // Assurez-vous que getConnection retourne une promesse
            const [results] = await connection.query('SELECT * FROM gm_user WHERE steam = ?', [this.steamID64]);

            if (results.length > 0) {
                return results[0].id;
            }
            
            return null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }
}

function getPlayerServerInformations(serverID, steamID64) {
    return new Promise(async (resolve, reject) => {
        const connection = await getConnection();
        const results = await connection.query('SELECT * FROM gm_server_stat WHERE steam_id = ?', [steamID64]);
        if (results.length > 0) {
            return resolve(new PlayerGmod(results[0]));
        }
        return reject('PlayerGmod not found');
    });
}

async function getPlayerServerInformationsFromDiscordID(serverID, discordID) {
    const connection = await getConnection();
    const results = await connection.query('SELECT * FROM gm_user WHERE id = ?', [discordID]);
    if (results.length > 0) {
        return getPlayerServerInformations(serverID, results[0].steam);
    }
    return null;
}

module.exports = {
    PlayerGmod,
    getPlayerServerInformations,
    getPlayerServerInformationsFromDiscordID
};