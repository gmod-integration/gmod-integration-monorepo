import { BaseClass } from './BaseClass.js';
import { getConnectionPromise } from '../../database/connection.js';
import { CustomValues } from './CustomValues.js';
import { Team } from './Team.js';
import { Position } from './Position.js';
import { Angle } from './Angle.js';
import gm_server_stat from '../../database/schema/gm_server_stat.js';
import gm_user from '../../database/schema/gm_user.js';

export class PlayerGmod extends BaseClass {
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
    const user = await gm_user.findOne({
      where: {
        steam: this.steamID64,
      },
    });

    return user ? user.id : null;
  }

  async saveServerStat(serverID) {
    try {
      const { connectTime, kills, deaths, customValues, userGroup, steamID64, name } = this;
      const customValuesString = typeof customValues === 'string' ? customValues : JSON.stringify(customValues);

      const player = await gm_server_stat.findOne({
        where: {
          steam_id: steamID64,
          server_id: serverID,
        },
      });

      if (player) {
        await player.update({
          rank: userGroup,
          name,
          total_time: player.total_time + connectTime,
          total_kill: player.total_kill + kills,
          total_death: player.total_death + deaths,
          custom_values: customValuesString,
        });
      } else {
        await gm_server_stat.create({
          steam_id: steamID64,
          server_id: serverID,
          rank: userGroup,
          name,
          total_time: connectTime,
          total_kill: kills,
          total_death: deaths,
          custom_values: customValuesString,
        });
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async saveServerStatSession(serverID) {
    try {
      const { connectTime, deaths, kills, customValues, steamID64 } = this;
      const customValuesString = typeof customValues === 'string' ? customValues : JSON.stringify(customValues);

      const connection = await getConnectionPromise();
      await connection.query(
        `
            INSERT INTO gm_server_stat_session (serverID, steamID64, time, deaths, kills, customValues)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
        [serverID, steamID64, connectTime, deaths, kills, customValuesString],
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

export async function updatePlayerUserGroup(serverID, steamID64, userGroup) {
  try {
    const player = await gm_server_stat.findOne({
      where: {
        steam_id: steamID64,
        server_id: serverID,
      },
    });
    if (player) {
      player.rank = userGroup;
      player.changed('updatedAt', true);
      await player.save();
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
