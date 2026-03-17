import { BaseClass } from './BaseClass.js';
import { Team } from './Team.js';
import prisma from '@gmod/infra-prisma';
import { getUserFromDiscordID, getUserFromSteamID64 } from './User.js';
import { getServerFromID, Server } from './Server.js';
import redis from '@gmod/infra-redis';
import { gmLog, LogLevel } from '../../utils/logger.js';
import { Position } from './Position.js';
import { Angle } from './Angle.js';
import { CustomValues } from './CustomValues.js';
import { getTranslate } from '../../utils/localizations.js';
import { secToTime } from '../../discord/utils/index.js';
import { Guild } from './Guild.js';
import { addAutoRoleToUser } from '../../models/v3/discordModels.js';
import { WSSendToServerData, wsSendToServerQueue } from '@gmod/infra-websocket/queues.js';
import { getGuildClient } from '../../discord/index.js';
import { GuildBan } from 'discord.js';

export interface PlayerGmodInterface {
  steamID: string;
  steamID64: string;
  connectTime: number;
  kills: number;
  customValues: CustomValues;
  deaths: number;
  team: Team;
  name: string;
  userGroup: string;
  position: Position;
  angle: Angle;
  fps: number | null;
  ping: number | null;
  adjustedTime: number | null;
  branch: string | null;
  timeLastTeamChange: number | null;
}

export class PlayerGmod extends BaseClass implements PlayerGmodInterface {
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
  public fps: number;
  public ping: number;
  public adjustedTime: number;
  public branch: string;
  public timeLastTeamChange: number;

  constructor(obj: PlayerGmodInterface, throwMissing = true) {
    super();

    this.checkMissingAndThrow(
      obj,
      {
        steamID: 'string',
        steamID64: 'string',
        connectTime: 'number',
        kills: 'number',
        customValues: 'object',
        deaths: 'number',
        team: 'object',
        name: 'string',
        userGroup: 'string',
        position: 'object',
        angle: 'object',
      },
      throwMissing,
    );

    this.steamID = obj.steamID;
    this.steamID64 = obj.steamID64;
    this.connectTime = obj.connectTime;
    this.kills = obj.kills;
    this.customValues = new CustomValues(obj.customValues);
    this.deaths = obj.deaths;
    this.team = new Team(obj.team, throwMissing);
    this.name = obj.name;
    this.userGroup = obj.userGroup;
    this.position = new Position(obj.position, throwMissing);
    this.angle = new Angle(obj.angle, throwMissing);
    this.fps = obj.fps || 0;
    this.ping = obj.ping || 0;
    this.adjustedTime = obj.adjustedTime || 0;
    this.branch = obj.branch || 'unknown';
    this.timeLastTeamChange = obj.timeLastTeamChange || 0;
  }

  getStringFromString(str: string) {
    return str
      .replace(/{name}/g, this.name)
      .replace(/{steamID64}/g, this.steamID64)
      .replace(/{team}/g, this.team.getName())
      .replace(/{userGroup}/g, this.userGroup)
      .replace(/{connectTime}/g, secToTime(this.connectTime))
      .replace(/{timeLastTeamChange}/g, secToTime(this.timeLastTeamChange))
      .replace(/{kills}/g, this.kills.toString())
      .replace(/{deaths}/g, this.deaths.toString())
      .replace(/{position}/g, this.position.toString())
      .replace(/{angle}/g, this.angle.toString())
      .replace(/{fps}/g, this.fps.toString())
      .replace(/{ping}/g, this.ping.toString())
      .replace(/{adjustedTime}/g, this.adjustedTime.toString())
      .replace(/{branch}/g, this.branch);
  }

  async getDiscordID() {
    const user = await getUserFromSteamID64(this.steamID64);
    return user ? user.getDiscordID() : null;
  }

  async getLogFormat(lang: string = 'en', level: LogLevel = LogLevel.MINIMAL, listArg: string[] = []) {
    let dscList = [];

    switch (level) {
      case LogLevel.MINIMAL:
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + this.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + this.name + '`');
        break;
      case LogLevel.NORMAL:
        dscList.push((await getTranslate('steamID64', lang)) + ': `' + this.steamID64 + '`');
        dscList.push((await getTranslate('name', lang)) + ': `' + this.name + '`');
        dscList.push((await getTranslate('team', lang)) + ': `' + this.team.getName() + '`');
        break;
      case LogLevel.CUSTOM:
        for (const arg in listArg) {
          dscList.push((await getTranslate(arg, lang)) + ': `' + this[arg] + '`');
        }
        break;
    }

    return dscList.join('\n');
  }

  async saveTeamTime(serverID: string) {
    if (!this.timeLastTeamChange || this.timeLastTeamChange === 0) return;

    try {
      await prisma.gm_server_stat_team_time.create({
        data: {
          serverID,
          steamID64: this.steamID64,
          team: this.team.getName(),
          teamID: this.team.getID(),
          time: this.timeLastTeamChange,
        },
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
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
            last_connect: new Date(),
            first_join: new Date(),
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

async function updateDiscordGroupRole(server: Server, steamID64: string, userGroup: string) {
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
  // if (!rankRole || !rankRole.enable) return;

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
    (role) =>
      syncRoles.some((syncRole) => syncRole.roleID === role.id) && role.id !== rankRole?.roleID && rankRole?.enable,
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
  if (rankRole && rankRole.enable && !member.roles.cache.has(rankRole.roleID)) {
    gmLog('sync-ranking', `Adding role to ${member.user.tag}: ${rankRole.roleID}`);
    await member.roles.add(rankRole.roleID);
  }
}

export async function updateDiscordTeamRole(server: Server, steamID64: string, teamName: string | null) {
  const user = await getUserFromSteamID64(steamID64);
  if (!user) return;

  const dscClient = await server.getBotInstance();
  if (!dscClient || !dscClient.user) return;

  const guild = await server.getDiscordGuild();
  if (!guild) return;

  const member = await guild.members.fetch(user.getDiscordID());
  if (!member) return;

  const syncRoles = await server.getSyncTeamRoles();

  // find all roles that are enabled and have the same team name
  const teamRoles = syncRoles.filter((role) => role.teamName === teamName);

  // get the bot role
  const botMember = guild.members.cache.get(dscClient.user.id);
  if (!botMember) return;

  const botRole = botMember.roles.highest;
  if (!botRole) return;

  // check if the bot role is higher than the team role
  if (teamRoles) {
    for (const teamRole of teamRoles) {
      const teamRoleObj = guild.roles.cache.get(teamRole.roleID);
      if (teamRoleObj && botRole.comparePositionTo(teamRoleObj) <= 0) {
        teamRoles.splice(teamRoles.indexOf(teamRole), 1);
      }
    }
  }

  const userRoles = member.roles.cache;
  const rolesToRemove = userRoles.filter(
    (role) =>
      syncRoles.some((syncRole) => syncRole.roleID === role.id) &&
      !teamRoles.some((teamRole) => teamRole.roleID === role.id && teamRole.enable),
  );

  if (rolesToRemove.size > 0) {
    gmLog(
      'sync-team-role',
      `Removing roles from ${member.user.tag}: ${rolesToRemove.map((role) => role.name).join(', ')}`,
    );
    await member.roles.remove(rolesToRemove);
  }

  for (const teamRole of teamRoles) {
    if (teamRole.enable && !member.roles.cache.has(teamRole.roleID)) {
      gmLog('sync-team-role', `Adding role to ${member.user.tag}: ${teamRole.roleID}`);
      await member.roles.add(teamRole.roleID);
    }
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
      await updateDiscordGroupRole(server, steamID64, userGroup);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function removeDiscordSync(discordID: string) {
  try {
    const user = await getUserFromDiscordID(discordID);
    if (!user || !user.steamID64) return;

    const serversStat = await prisma.gm_server_stat.findMany({
      where: {
        steam_id: user.steamID64,
      },
    });

    let guildsDone: string[] = [];

    for (const serverStat of serversStat) {
      const server = await getServerFromID(serverStat.server_id);
      if (!server) continue;

      // don't do the same guild twice
      if (guildsDone.includes(server.getGuildID())) continue;
      guildsDone.push(server.getGuildID());

      const dscGuild = await server.getDiscordGuild();
      if (!dscGuild) return;

      const gmGuild = new Guild(dscGuild);
      if (!gmGuild) return;

      const member = await dscGuild.members.fetch(discordID).catch(() => null);
      if (!member) return;

      // get team roles
      const teamRoles = await server.getSyncTeamRoles();

      // get sync roles
      const syncRoles = await server.getSyncRoles();

      // get verif roles
      const verifyRole = await prisma.gm_guild_verify_role.findMany({
        where: {
          guildID: dscGuild.id,
        },
      });

      const userRoles = member.roles.cache;

      const rolesToRemove = userRoles.filter(
        (role) =>
          syncRoles.some((syncRole) => syncRole.roleID === role.id) ||
          teamRoles.some((teamRole) => teamRole.roleID === role.id) ||
          verifyRole.some((verifyRole) => verifyRole.roleID === role.id),
      );

      if (rolesToRemove.size > 0) {
        gmLog(
          'sync-team-role',
          `Removing roles from ${member.user.tag}: ${rolesToRemove.map((role) => role.name).join(', ')}`,
        );
        await member.roles.remove(rolesToRemove);
      }

      // regive default role
      await addAutoRoleToUser(dscGuild, member);
    }
  } catch (error) {
    console.error(error);
    // skip the error
  }

  return;
}

export async function removeServerSync(steamID64: string) {
  try {
    const serversStat = await prisma.gm_server_stat.findMany({
      where: {
        steam_id: steamID64,
      },
    });

    for (const serverStat of serversStat) {
      const server = await getServerFromID(serverStat.server_id);
      if (!server) continue;

      await prisma.gm_server_stat.update({
        where: {
          server_id_steam_id: {
            steam_id: steamID64,
            server_id: server.getID(),
          },
        },
        data: {
          rank: 'user',
        },
      });

      await wsSendToServerQueue.add('wsSendToServer', {
        id: server.getID(),
        data: {
          method: 'wsPlayerUpdateGroup',
          steamID64: steamID64,
          group: serverStat.rank,
          add: false,
        },
      } as WSSendToServerData);
    }
  } catch (error) {
    console.error(error);
    // skip the error
  }

  return;
}

export async function changeLinkCheckDiscordBan(oldDiscordIDS: string[], newDiscordID: string) {
  try {
    const dscGuilds = await prisma.gm_guild_member.findMany({
      where: {
        user_id: {
          in: oldDiscordIDS,
        },
      },
    });

    for (const dscGuild of dscGuilds) {
      const client = await getGuildClient(dscGuild.guild_id);

      const guild = client.guilds.cache.get(dscGuild.guild_id);
      if (!guild) continue;

      // get if one of the discordID is banned
      let banInfo: GuildBan | null = null;
      for (const oldDiscordID of oldDiscordIDS) {
        const ban = await guild.bans.fetch(oldDiscordID);
        if (ban) {
          banInfo = ban;
          break;
        }
      }

      // if ban, ban all discordID and the new one with prefix to reason "Gmod Integration - Sync Ban : ..."
      if (banInfo) {
        for (const oldDiscordID of oldDiscordIDS) {
          await guild.members.ban(oldDiscordID, {
            reason: `Gmod Integration - Sync Ban : ${banInfo.reason || 'No Reason'}`,
          });
        }

        await guild.members.ban(newDiscordID, {
          reason: `Gmod Integration - Sync Ban : ${banInfo.reason || 'No Reason'}`,
        });
      }
    }
  } catch (error) {
    console.error(error);
    // skip the error
  }

  return;
}
