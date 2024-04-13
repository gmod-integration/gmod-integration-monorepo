const {getConnectionPromise, getConnection} = require('../../database/connection.js');
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
            const connection = await getConnectionPromise(); // Assurez-vous que getConnection retourne une promesse
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

    async saveServerStat(serverID) {
        try {
            const {connectTime, kills, deaths, customValues, userGroup, steamID64, name} = this;
            const customValuesString = typeof customValues === 'string' ? customValues : JSON.stringify(customValues);

            const connection = await getConnectionPromise();
            await connection.query(`
                INSERT INTO gm_server_stat (steam_id, server_id, rank, name, total_time, total_kill, total_death,
                                            custom_values,
                                            last_connect)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, DEFAULT)
                ON DUPLICATE KEY UPDATE rank          = VALUES(rank),
                                        name          = VALUES(name),
                                        total_time    = total_time + VALUES(total_time),
                                        total_kill    = total_kill + VALUES(total_kill),
                                        total_death   = total_death + VALUES(total_death),
                                        custom_values = VALUES(custom_values),
                                        last_connect  = DEFAULT
            `, [steamID64, serverID, userGroup, name, connectTime, kills, deaths, customValuesString]);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async saveServerStatSession(serverID) {
        try {
            const {connectTime, deaths, kills, customValues, steamID64} = this;
            const customValuesString = typeof customValues === 'string' ? customValues : JSON.stringify(customValues);

            const connection = await getConnectionPromise();
            await connection.query(`
                INSERT INTO gm_server_stat_session (serverID, steamID64, time, deaths, kills, customValues)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [serverID, steamID64, connectTime, deaths, kills, customValuesString]);
        } catch (error) {
            console.error(error);
            throw error;
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

async function updatePlayerUserGroup(serverID, steamID64, userGroup) {
    try {
        const connection = await getConnectionPromise();
        await connection.query('UPDATE gm_server_stat SET rank = ? WHERE steam_id = ? AND server_id = ?', [userGroup, steamID64, serverID]);
    } catch (error) {
        console.error(error);
        throw error;
    }
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
    getPlayerServerInformationsFromDiscordID,
    updatePlayerUserGroup
};