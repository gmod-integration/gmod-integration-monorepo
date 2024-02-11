import {badArgument} from "../../utils/tools";
import {getConnection} from "../../database/connection";

class Player {
    constructor(steamID, steamID64, connectTime, kills, customValues, deaths, team, teamName, name, userGroup) {
        this.steamID = steamID;
        this.steamID64 = steamID64;
        this.connectTime = connectTime;
        this.kills = kills;
        this.customValues = customValues;
        this.deaths = deaths;
        this.team = team;
        this.teamName = teamName;
        this.name = name;
        this.userGroup = userGroup;
    }

    isValid() {
        return !badArgument([this.steamID, this.steamID64, this.connectTime, this.kills, this.customValues, this.deaths, this.team, this.teamName, this.name, this.userGroup]);
    }

    static fromObject(obj) {
        return new Player(obj.steamID, obj.steamID64, obj.connectTime, obj.kills, obj.customValues, obj.deaths, obj.team, obj.teamName, obj.name, obj.userGroup);
    }

    toObject() {
        return {
            steamID: this.steamID,
            steamID64: this.steamID64,
            connectTime: this.connectTime,
            kills: this.kills,
            customValues: this.customValues,
            deaths: this.deaths,
            team: this.team,
            teamName: this.teamName,
            name: this.name,
            userGroup: this.userGroup
        };
    }
}

function getPlayerServerInformations(serverID, steamID64) {
    return new Promise((resolve, reject) => {
        getConnection().then((connection) => {
            connection.query('SELECT * FROM gm_server_stat WHERE server_id = ? AND steam_id = ?', [serverID, steamID64], (error, results) => {
                if (error) return reject(error);

                if (results.length > 0) {
                    return resolve(Player.fromObject(results[0]));
                } else {
                    return resolve(null);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports = {
    Player,
    getPlayerServerInformations
};