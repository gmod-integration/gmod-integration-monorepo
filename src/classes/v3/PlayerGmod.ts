import { BaseClass } from './BaseClass';
import { CustomValues } from './CustomValues';
import { Team } from './Team';
import { Position } from './Position';
import { Angle } from './Angle';
import prisma from '../../prisma';
import { getUserFromSteamID64 } from './User';
import { Server } from './Server';
import redis from '../../redis';
import { gmLog } from '../../utils/logger';

export class PlayerGmod extends BaseClass {
  public readonly steamID: string;
  public readonly steamID64: string;
  public connectTime: number;
  public kills: number;
  public customValues: CustomValues;
  public deaths: number;
  public team: Team;
  public name: string;
  public userGroup: string;
  public position: Position;
  public angle: Angle;

  constructor(obj: any) {
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
    const user = await getUserFromSteamID64(this.steamID64);
    return user ? user.getDiscordID() : null;
  }

  async saveServerStat(serverID: string) {
    try {
      const { connectTime, kills, deaths, customValues, userGroup, steamID64, name } = this;
      const customValuesString = JSON.stringify(customValues);

      const player = await prisma.gm_server_stat.findFirst({
        where: {
          steam_id: steamID64,
          server_id: serverID,
        },
      });

      if (player) {
        await prisma.gm_server_stat.update({
          where: {
            server_id_steam_id: {
              steam_id: steamID64,
              server_id: serverID,
            },
          },
          data: {
            rank: userGroup,
            name,
            total_time: player.total_time + connectTime,
            total_kill: player.total_kill + kills,
            total_death: player.total_death + deaths,
            custom_values: customValuesString,
          },
        });
      } else {
        await prisma.gm_server_stat.create({
          data: {
            steam_id: steamID64,
            server_id: serverID,
            rank: userGroup,
            name,
            total_time: connectTime,
            total_kill: kills,
            total_death: deaths,
            custom_values: customValuesString,
          },
        });
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async saveServerStatSession(serverID: string) {
    const { connectTime, deaths, kills, customValues, steamID64 } = this;

    await prisma.gm_server_stat_session.create({
      data: {
        serverID,
        steamID64,
        time: connectTime,
        deaths,
        kills,
        customValues: JSON.stringify(customValues),
      },
    });
  }
}

async function updateDiscordRole(server: Server, steamID64: string, userGroup: string) {
  const user = await getUserFromSteamID64(steamID64);
  if (!user) return;

  const syncDirection = await server.getSetting('sync_role_direction');
  if (syncDirection !== 'both' && syncDirection !== 'gmod-to-discord') {
    return;
  }

  const dscClient = await server.getBotInstance();
  if (!dscClient || !dscClient.user) return;

  const guild = await server.getDiscordGuild();
  if (!guild) return;

  const member = await guild.members.fetch(user.getDiscordID());
  if (!member) return;

  const syncRoles = await server.getSyncRoles();

  const rankRole = syncRoles.find((role) => role.userGroup === userGroup) || null;

  // get the bot role
  const botMember = guild.members.cache.get(dscClient.user.id);
  if (!botMember) return;

  const botRole = botMember.roles.highest;
  if (!botRole) return;

  // check if the bot role is higher than the rank role
  if (rankRole) {
    const rankRoleObj = guild.roles.cache.get(rankRole.roleID);
    if (rankRoleObj && botRole.comparePositionTo(rankRoleObj) <= 0) {
      return;
    }
  }

  const userRoles = member.roles.cache;
  const rolesToRemove = userRoles.filter(
    (role) => syncRoles.some((syncRole) => syncRole.roleID === role.id) && role.id !== rankRole?.roleID,
  );

  // redis the update to avoid dsc |-> gmod sursync
  const redisKey = `sync-role:gmod:server:${server.id}:user:${user.getSteamID64()}`;
  await redis.set(
    redisKey,
    JSON.stringify({
      removeIDs: rolesToRemove.map((role) => role.id),
      addIDs: rankRole ? [rankRole.roleID] : [],
    }),
    'EX',
    120,
  );

  if (rolesToRemove.size > 0) {
    gmLog(
      'sync-ranking',
      `Removing roles from ${member.user.tag}: ${rolesToRemove.map((role) => role.name).join(', ')}`,
    );
    await member.roles.remove(rolesToRemove);
  }

  // if user doesn't have the rank role then add it
  if (rankRole && !member.roles.cache.has(rankRole.roleID)) {
    gmLog('sync-ranking', `Adding role to ${member.user.tag}: ${rankRole.roleID}`);
    await member.roles.add(rankRole.roleID);
  }
}

export async function updatePlayerUserGroup(server: Server, steamID64: string, userGroup: string) {
  try {
    const player = await prisma.gm_server_stat.findFirst({
      where: {
        steam_id: steamID64,
        server_id: server.getID(),
      },
    });

    if (player) {
      await prisma.gm_server_stat.update({
        where: {
          server_id_steam_id: {
            steam_id: steamID64,
            server_id: server.getID(),
          },
        },
        data: {
          rank: userGroup,
        },
      });

      //   update the player discord role
      await updateDiscordRole(server, steamID64, userGroup);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
