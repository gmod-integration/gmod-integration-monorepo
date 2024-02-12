import {badArgument} from "../../utils/tools";
import {getConnection} from "../../database/connection";
import {Team} from "./team";

class Player {
    constructor(steamID, steamID64, connectTime, kills, customValues, deaths, team, name, userGroup) {
        this.steamID = steamID;
        this.steamID64 = steamID64;
        this.connectTime = connectTime;
        this.kills = kills;
        this.customValues = customValues;
        this.deaths = deaths;
        this.team = Team.fromObject(team);
        this.name = name;
        this.userGroup = userGroup;
    }

    isValid() {
        return !badArgument([this.steamID, this.steamID64, this.connectTime, this.kills, this.customValues, this.deaths, this.team.isValid(), this.name, this.userGroup]);
    }

    static fromObject(obj) {
        return new Player(obj.steamID, obj.steamID64, obj.connectTime, obj.kills, obj.customValues, obj.deaths, obj.team.fromObject(), obj.name, obj.userGroup);
    }

    toObject() {
        return {
            steamID: this.steamID,
            steamID64: this.steamID64,
            connectTime: this.connectTime,
            kills: this.kills,
            customValues: this.customValues,
            deaths: this.deaths,
            team: this.team.toObject(),
            name: this.name,
            userGroup: this.userGroup
        };
    }

    async getDiscordID() {
        const connection = await getConnection();
        const results = await connection.query('SELECT * FROM gm_user WHERE steam = ?', [this.steamID64]);
        if (results.length > 0) {
            return results[0].id;
        }
        return null;
    }
}

function getPlayerServerInformations(serverID, steamID64) {
    return new Promise(async (resolve, reject) => {
        const connection = await getConnection();
        const results = await connection.query('SELECT * FROM gm_server_stat WHERE steam_id = ?', [steamID64]);
        if (results.length > 0) {
            return resolve(Player.fromObject(results[0]));
        }
        return reject('Player not found');
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
    Player,
    getPlayerServerInformations,
    getPlayerServerInformationsFromDiscordID
};