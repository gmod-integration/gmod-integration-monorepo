import { BaseClass } from './BaseClass.js';
import { CustomValues } from './CustomValues.js';
import { getConnectionPromise } from '../../database/connection.js';

export class Player extends BaseClass {
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
    this.bypassMaintenance = obj.bypassMaintenance || false;
  }

  getSteamID64() {
    return this.steamID64;
  }

  isSuperAdmin() {
    return this.rank === 'superadmin';
  }
}

export function getServerPlayer(serverID, steamID64) {
  return new Promise(async (resolve, reject) => {
    const connection = await getConnectionPromise();
    const [results] = await connection.query('SELECT * FROM gm_server_stat WHERE server_id = ? AND steam_id = ?', [
      serverID,
      steamID64,
    ]);
    if (results.length > 0) {
      return resolve(
        new Player({
          steamID64: results[0].steam_id,
          customValues: JSON.parse(results[0].custom_values),
          lastConnection: results[0].last_connect,
          kills: results[0].total_kill,
          deaths: results[0].total_death,
          playTime: results[0].total_time,
          rank: results[0].rank,
          name: results[0].name,
          bypassMaintenance: results[0].bypassMaintenance === 1,
        }),
      );
    }
  });
}
