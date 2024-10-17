// Users
import gm_user from './gm_user.ts';
import UsersDataRequest from './UsersDataRequest.js';
import UsersNotifications from './UsersNotifications.js';
// Steam
import gm_user_steam from './gm_user_steam.js';
// Guild
import gm_guild from './gm_guild.js';
import gm_guild_auto_roles from './gm_guild_auto_roles.js';
import gm_guild_not_verify_role from './gm_guild_not_verify_role.js';
import gm_guild_verify_msg from './gm_guild_verify_msg.js';
import gm_guild_verify_role from './gm_guild_verify_role.js';
import ServerLinks from './ServerLinks.js';
import GuildNotVerifiedRole from './GuildNotVerifiedRole.js';
import GuildSettings from './GuildSettings.js';
import PremiumGuild from './PremiumGuild.js';
// Server
import gm_server from './gm_server.js';
import gm_server_status from './gm_server_status.js';
import gm_server_customValues from './gm_server_customValues.js';
import gm_server_leaderboard_options from './gm_server_leaderboard_options.js';
import gm_server_screenshot_channels from './gm_server_screenshot_channels.js';
import gm_server_stat from './gm_server_stat.js';
import gm_status_button from './gm_status_button.js';
import gm_sync_chat from './gm_sync_chat.js';
import ServerLogs from './ServerLogs.js';
import ServerLogsChannel from './ServerLogsChannel.js';
import ServerLuaError from './ServerLuaError.js';
import ServerPlayerSession from './ServerPlayerSession.js';
import ServerPseudo from './ServerPseudo.js';
import ServerRole from './ServerRole.js';
import ServerSetting from './ServerSettings.js';
import ServerSyncRole from './ServerSyncRole.js';
import ServerVote from './ServerVote.js';
import ServerVoteChannel from './ServerVoteChannel.js';
import ServerWarn from './ServerWarn.js';
import ServerWarnOptions from './ServerWarnOptions.js';
import ServerSyncChatFilter from './ServerSyncChatFilter.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
// Other the Rest
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of files already imported manually
const currentFile = path.basename(__filename);

const directoryPath = path.join(__dirname, './');
fs.readdirSync(directoryPath).forEach((file) => {
  if (file.endsWith('.js') && file !== currentFile) {
    import(`./${file}`);
  }
});

// UserDataRequest
gm_user.hasMany(UsersDataRequest, {
  foreignKey: 'discordID',
  as: 'userDataRequests',
});
UsersDataRequest.belongsTo(gm_user, {
  foreignKey: 'discordID',
  as: 'dataRequestUser',
});

// UsersNotifications
gm_user.hasMany(UsersNotifications, {
  foreignKey: 'discordID',
  as: 'userNotifications',
});
UsersNotifications.belongsTo(gm_user, {
  foreignKey: 'discordID',
  as: 'notificationUser',
});

// gm_guild
gm_guild.hasMany(gm_server, {
  foreignKey: 'guild',
  as: 'guildServers',
});
gm_server.belongsTo(gm_guild, {
  foreignKey: 'guild',
  as: 'serverGuild',
});

// gm_guild_auto_roles
gm_guild.hasMany(gm_guild_auto_roles, {
  foreignKey: 'guildID',
  as: 'guildAutoRoles',
});
gm_guild_auto_roles.belongsTo(gm_guild, {
  foreignKey: 'guildID',
  as: 'autoRolesGuild',
});

// gm_guild_not_verify_role
gm_guild.hasMany(gm_guild_not_verify_role, {
  foreignKey: 'guildID',
  as: 'guildNotVerifyRoles',
});
gm_guild_not_verify_role.belongsTo(gm_guild, {
  foreignKey: 'guildID',
  as: 'notVerifyRolesGuild',
});

// gm_guild_verify_msg
gm_guild.hasOne(gm_guild_verify_msg, {
  foreignKey: 'guildID',
  as: 'guildVerifyMsg',
});
gm_guild_verify_msg.belongsTo(gm_guild, {
  foreignKey: 'guildID',
  as: 'verifyMsgGuild',
});

// gm_guild_verify_role
gm_guild.hasMany(gm_guild_verify_role, {
  foreignKey: 'guildID',
  as: 'guildVerifyRoles',
});
gm_guild_verify_role.belongsTo(gm_guild, {
  foreignKey: 'guildID',
  as: 'verifyRolesGuild',
});

// ServerLinks
gm_guild.hasMany(ServerLinks, {
  foreignKey: 'guild',
  as: 'guildLinks',
});
ServerLinks.belongsTo(gm_guild, {
  foreignKey: 'guild',
  as: 'linkGuild',
});

// gm_server_customValues
gm_server.hasMany(gm_server_customValues, {
  foreignKey: 'serverID',
  as: 'serverCustomValues',
});
gm_server_customValues.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'customValuesServer',
});

// gm_server_leaderboard_options
gm_server.hasMany(gm_server_leaderboard_options, {
  foreignKey: 'serverID',
  as: 'serverLeaderboardOptions',
});
gm_server_leaderboard_options.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'leaderboardOptionsServer',
});

// gm_server_screenshot_channels
gm_server.hasMany(gm_server_screenshot_channels, {
  foreignKey: 'server',
  as: 'serverScreenshotChannels',
});
gm_server_screenshot_channels.belongsTo(gm_server, {
  foreignKey: 'server',
  as: 'screenshotChannelsServer',
});

// gm_server_stat
gm_server.hasMany(gm_server_stat, {
  foreignKey: 'server_id',
  as: 'serverStats',
});
gm_server_stat.belongsTo(gm_server, {
  foreignKey: 'server_id',
  as: 'statServer',
});
gm_user_steam.hasMany(gm_server_stat, {
  foreignKey: 'steam_id',
  as: 'userStats',
});
gm_server_stat.belongsTo(gm_user_steam, {
  foreignKey: 'steam_id',
  as: 'statUser',
});

// gm_server_status
gm_server.hasOne(gm_server_status, {
  foreignKey: 'id',
  as: 'serverStatus',
});
gm_server_status.belongsTo(gm_server, {
  foreignKey: 'id',
  as: 'statusServer',
});

// gm_status_button
gm_server.hasMany(gm_status_button, {
  foreignKey: 'server',
  as: 'serverStatusButtons',
});
gm_status_button.belongsTo(gm_server, {
  foreignKey: 'server',
  as: 'statusButtonServer',
});

// gm_sync_chat
gm_server.hasMany(gm_sync_chat, {
  foreignKey: 'server',
  as: 'serverSyncChats',
});
gm_sync_chat.belongsTo(gm_server, {
  foreignKey: 'server',
  as: 'syncChatServer',
});
gm_guild.hasMany(gm_sync_chat, {
  foreignKey: 'guild',
  as: 'guildSyncChats',
});
gm_sync_chat.belongsTo(gm_guild, {
  foreignKey: 'guild',
  as: 'syncChatGuild',
});

// GuildNotVerifiedRole
gm_guild.hasMany(GuildNotVerifiedRole, {
  foreignKey: 'guild',
  as: 'guildNotVerifiedRoles',
});
GuildNotVerifiedRole.belongsTo(gm_guild, {
  foreignKey: 'guild',
  as: 'notVerifiedRolesGuild',
});

// GuildSettings
gm_guild.hasMany(GuildSettings, {
  foreignKey: 'guildID',
  as: 'guildSettings',
});
GuildSettings.belongsTo(gm_guild, {
  foreignKey: 'guildID',
  as: 'settingsGuild',
});

// PremiumGuild
gm_guild.hasMany(PremiumGuild, {
  foreignKey: 'guildID',
  as: 'guildPremium',
});
PremiumGuild.belongsTo(gm_guild, {
  foreignKey: 'guildID',
  as: 'premiumGuild',
});

// ServerLogs
gm_server.hasMany(ServerLogs, {
  foreignKey: 'serverID',
  as: 'serverLogs',
});
ServerLogs.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'logsServer',
});

// ServerLogsChannel
gm_server.hasMany(ServerLogsChannel, {
  foreignKey: 'serverID',
  as: 'serverLogsChannels',
});
ServerLogsChannel.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'logsChannelServer',
});

// ServerLuaError
gm_server.hasMany(ServerLuaError, {
  foreignKey: 'serverID',
  as: 'serverErrors',
});
ServerLuaError.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'errorServer',
});

// ServerPlayerSession
gm_server.hasMany(ServerPlayerSession, {
  foreignKey: 'serverID',
  as: 'serverPlayerSessions',
});
ServerPlayerSession.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'playerSessionServer',
});
gm_user_steam.hasMany(ServerPlayerSession, {
  foreignKey: 'steamID64',
  as: 'playerSessions',
});
ServerPlayerSession.belongsTo(gm_user_steam, {
  foreignKey: 'steamID64',
  as: 'playerSessionUser',
});

// ServerPseudo
gm_server.hasMany(ServerPseudo, {
  foreignKey: 'serverID',
  as: 'serverPseudos',
});
ServerPseudo.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'pseudoServer',
});

// ServerRole
gm_server.hasMany(ServerRole, {
  foreignKey: 'serverID',
  as: 'serverRoles',
});
ServerRole.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'roleServer',
});

// ServerSetting
gm_server.hasMany(ServerSetting, {
  foreignKey: 'serverID',
  as: 'serverSettings',
});
ServerSetting.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'settingServer',
});

// ServerSyncRole
gm_server.hasMany(ServerSyncRole, {
  foreignKey: 'serverID',
  as: 'serverSyncRoles',
});
ServerSyncRole.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'syncRoleServer',
});

// ServerVote
gm_server.hasMany(ServerVote, {
  foreignKey: 'serverID',
  as: 'serverVotes',
});
ServerVote.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'voteServer',
});

// ServerVoteChannel
gm_server.hasMany(ServerVoteChannel, {
  foreignKey: 'serverID',
  as: 'serverVoteChannels',
});
ServerVoteChannel.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'voteChannelServer',
});

// ServerWarn
gm_server.hasMany(ServerWarn, {
  foreignKey: 'serverID',
  as: 'serverWarns',
});
ServerWarn.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'warnServer',
});

// ServerWarnOptions
gm_server.hasMany(ServerWarnOptions, {
  foreignKey: 'serverID',
  as: 'serverWarnOptions',
});
ServerWarnOptions.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'warnOptionsServer',
});

// ServerSyncChatFilter
gm_server.hasMany(ServerSyncChatFilter, {
  foreignKey: 'serverID',
  as: 'serverSyncChatFilters',
});
ServerSyncChatFilter.belongsTo(gm_server, {
  foreignKey: 'serverID',
  as: 'syncChatFilterServer',
});
