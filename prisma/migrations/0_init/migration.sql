-- CreateTable
CREATE TABLE `ServerStatus` (
    `server` VARCHAR(255) NOT NULL,
    `message` VARCHAR(255) NOT NULL DEFAULT '',
    `channel` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`server`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banUsers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `steamID64` VARCHAR(255) NOT NULL DEFAULT '',
    `ip` VARCHAR(255) NOT NULL DEFAULT '',
    `discordID` VARCHAR(255) NOT NULL DEFAULT '',
    `reason` VARCHAR(255) NOT NULL DEFAULT '',
    `banDate` DATETIME(0) NOT NULL,
    `banTime` INTEGER NOT NULL DEFAULT 0,
    `unbanDate` DATETIME(0) NOT NULL,
    `admin` VARCHAR(255) NOT NULL DEFAULT '',
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `permanent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_discordToken` (
    `discordID` VARCHAR(255) NOT NULL,
    `accessToken` VARCHAR(255) NOT NULL,
    `refreshToken` VARCHAR(255) NOT NULL,
    `creationDate` DATETIME(0) NOT NULL,
    `expirationDate` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`discordID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_gmodstore_purchases` (
    `steamID64` VARCHAR(255) NOT NULL,
    `userID` VARCHAR(255) NOT NULL DEFAULT '',
    `guild` VARCHAR(255) NOT NULL DEFAULT '',
    `token` VARCHAR(255) NOT NULL DEFAULT '',
    `revoke` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`steamID64`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild` (
    `guild` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `member` INTEGER NOT NULL DEFAULT 0,
    `language` VARCHAR(255) NOT NULL DEFAULT 'en',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`guild`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_auto_roles` (
    `guildID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `guildID`(`guildID`),
    PRIMARY KEY (`roleID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_not_verify_role` (
    `guildID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `guildID`(`guildID`),
    PRIMARY KEY (`roleID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_premium` (
    `guildID` VARCHAR(255) NOT NULL,
    `transaction` TEXT NULL,
    `buyer` TEXT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`guildID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_settings` (
    `guildID` VARCHAR(255) NOT NULL,
    `setting` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`guildID`, `setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_verify_msg` (
    `guildID` VARCHAR(255) NOT NULL,
    `messageID` VARCHAR(255) NOT NULL,
    `channelID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`guildID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_verify_role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `isGiveRole` BOOLEAN NOT NULL DEFAULT true,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `guildID`(`guildID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_panelToken` (
    `id` CHAR(36) NOT NULL,
    `discordID` VARCHAR(255) NOT NULL,
    `accessToken` VARCHAR(255) NOT NULL,
    `creationDate` DATETIME(0) NOT NULL,
    `expirationDate` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,
    `os` VARCHAR(255) NULL,
    `ip` VARCHAR(255) NULL,
    `country` VARCHAR(255) NULL,
    `browser` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_role_auto` (
    `guild` VARCHAR(255) NOT NULL,
    `id` VARCHAR(255) NOT NULL,
    `channel` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`guild`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server` (
    `id` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `publicTempToken` VARCHAR(255) NULL DEFAULT '',
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `guild` VARCHAR(255) NOT NULL,
    `ip` VARCHAR(255) NULL DEFAULT '127.0.0.1',
    `port` VARCHAR(255) NULL DEFAULT '27015',
    `name` VARCHAR(255) NULL DEFAULT 'New Gmod Server',
    `image` VARCHAR(255) NULL DEFAULT '',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `guild`(`guild`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_customValues` (
    `serverID` VARCHAR(255) NOT NULL,
    `valueName` VARCHAR(255) NOT NULL,
    `enable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`valueName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_errors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `count` INTEGER NOT NULL,
    `realm` VARCHAR(255) NOT NULL,
    `error` TEXT NOT NULL,
    `stack` TEXT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `steamID64` VARCHAR(255) NOT NULL DEFAULT '',
    `workshopID` VARCHAR(255) NOT NULL DEFAULT '',
    `uptime` INTEGER NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_leaderboard_options` (
    `serverID` VARCHAR(255) NOT NULL,
    `messageID` VARCHAR(255) NOT NULL DEFAULT '',
    `category` VARCHAR(255) NOT NULL DEFAULT '',
    `limitValue` INTEGER NOT NULL DEFAULT 10,
    `offsetValue` INTEGER NOT NULL DEFAULT 0,
    `orderValue` VARCHAR(255) NOT NULL DEFAULT 'DESC',
    `page` INTEGER NOT NULL DEFAULT 1,
    `totalPage` INTEGER NOT NULL DEFAULT 1,
    `total` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`serverID`, `messageID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` TEXT NOT NULL,
    `alias` VARCHAR(255) NOT NULL DEFAULT 'Example',
    `guild` VARCHAR(255) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `guild`(`guild`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `type` VARCHAR(255) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `playerInvolvedSteamID64` LONGTEXT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_logs_channel` (
    `serverID` VARCHAR(255) NOT NULL,
    `channelID` VARCHAR(255) NOT NULL,
    `webhookID` VARCHAR(255) NOT NULL,
    `webhookToken` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`serverID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_pseudo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `role` VARCHAR(255) NOT NULL DEFAULT '',
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `prefix` VARCHAR(255) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_report_bugs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `steamID64` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `steps` TEXT NOT NULL,
    `expected` TEXT NOT NULL,
    `actual` TEXT NOT NULL,
    `importance` ENUM('low', 'medium', 'high', 'trivial', 'critical') NOT NULL DEFAULT 'low',
    `screenshot` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `role` VARCHAR(255) NULL,
    `roleName` VARCHAR(255) NOT NULL DEFAULT '',
    `prefix` VARCHAR(255) NOT NULL DEFAULT '',
    `discordRoleID` VARCHAR(255) NULL,
    `enablePrefix` BOOLEAN NOT NULL DEFAULT false,
    `enableSync` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_screenshot_channels` (
    `server` VARCHAR(255) NOT NULL,
    `adminCmd` BOOLEAN NOT NULL DEFAULT false,
    `channelID` VARCHAR(255) NOT NULL DEFAULT '',
    `webhook` VARCHAR(255) NOT NULL DEFAULT '',
    `token` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`server`, `adminCmd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_screenshots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL DEFAULT '',
    `player` LONGTEXT NOT NULL,
    `url` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_settings` (
    `serverID` VARCHAR(255) NOT NULL,
    `setting` VARCHAR(255) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`serverID`, `setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_stat` (
    `server_id` VARCHAR(255) NOT NULL,
    `steam_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `rank` VARCHAR(255) NOT NULL DEFAULT 'user',
    `total_time` INTEGER NOT NULL DEFAULT 0,
    `total_death` INTEGER NOT NULL DEFAULT 0,
    `total_kill` INTEGER NOT NULL DEFAULT 0,
    `total_money` INTEGER NOT NULL DEFAULT 0,
    `total_connect` INTEGER NOT NULL DEFAULT 1,
    `last_connect` DATETIME(0) NOT NULL,
    `first_join` DATETIME(0) NOT NULL,
    `custom_values` LONGTEXT NOT NULL,
    `bypassMaintenance` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `steam_id`(`steam_id`),
    PRIMARY KEY (`server_id`, `steam_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_stat_session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `steamID64` VARCHAR(255) NOT NULL,
    `time` INTEGER NOT NULL DEFAULT 0,
    `kills` INTEGER NOT NULL DEFAULT 0,
    `deaths` INTEGER NOT NULL DEFAULT 0,
    `customValues` LONGTEXT NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    INDEX `steamID64`(`steamID64`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_status` (
    `id` VARCHAR(255) NOT NULL,
    `ip` VARCHAR(255) NOT NULL DEFAULT '',
    `port` INTEGER NOT NULL DEFAULT 0,
    `hostname` VARCHAR(255) NOT NULL DEFAULT '',
    `maxPlayers` INTEGER NOT NULL DEFAULT 0,
    `players` INTEGER NOT NULL DEFAULT 0,
    `map` VARCHAR(255) NOT NULL DEFAULT '',
    `gameMode` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_sync_chat_filter` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `element` ENUM('message', 'teamName', 'userGroup', 'steamID64') NOT NULL DEFAULT 'message',
    `operator` ENUM('contain', 'notContain', 'equal', 'notEqual', 'startWith', 'endWith') NOT NULL DEFAULT 'startWith',
    `trigger` VARCHAR(255) NOT NULL DEFAULT '',
    `action` ENUM('block', 'relay', 'anonymize') NOT NULL DEFAULT 'block',
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_sync_roles` (
    `serverID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `userGroup` VARCHAR(255) NOT NULL DEFAULT '',
    `enable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`serverID`, `roleID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_vote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `userID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    INDEX `userID`(`userID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_vote_channels` (
    `serverID` VARCHAR(255) NOT NULL,
    `channelID` VARCHAR(255) NOT NULL,
    `webhookID` VARCHAR(255) NOT NULL,
    `webhookToken` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`serverID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_warn` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `userSteamID64` VARCHAR(255) NOT NULL,
    `adminSteamID64` VARCHAR(255) NOT NULL,
    `reason` TEXT NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_warn_options` (
    `msgID` VARCHAR(255) NOT NULL,
    `serverID` VARCHAR(255) NOT NULL,
    `steamID64` VARCHAR(255) NOT NULL,
    `total` INTEGER NOT NULL,
    `limit` INTEGER NOT NULL,
    `offset` INTEGER NOT NULL,
    `order` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`msgID`, `steamID64`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_status` (
    `server` VARCHAR(255) NOT NULL,
    `message` VARCHAR(255) NOT NULL DEFAULT '',
    `channel` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`server`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_status_button` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `server` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL DEFAULT 'Example',
    `url` TEXT NOT NULL,
    `emoji` VARCHAR(255) NOT NULL DEFAULT '?',
    `enable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `server`(`server`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_sync_chat` (
    `server` VARCHAR(255) NOT NULL,
    `guild` VARCHAR(255) NOT NULL,
    `id` VARCHAR(255) NOT NULL DEFAULT '',
    `channel` VARCHAR(255) NOT NULL DEFAULT '',
    `token` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `guild`(`guild`),
    PRIMARY KEY (`server`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_user` (
    `id` VARCHAR(255) NOT NULL,
    `rank` VARCHAR(255) NOT NULL DEFAULT 'user',
    `steam` VARCHAR(255) NULL,
    `username` VARCHAR(255) NOT NULL DEFAULT '',
    `last_oauth` DATETIME(0) NOT NULL,
    `trust` INTEGER NOT NULL DEFAULT 50,
    `token` VARCHAR(255) NULL,
    `token_expires` DATETIME(0) NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_user_steam` (
    `steam_id` VARCHAR(255) NOT NULL,
    `username` VARCHAR(255) NOT NULL DEFAULT '',
    `last_ip` VARCHAR(255) NOT NULL DEFAULT '',
    `last_connect` DATETIME(0) NOT NULL,
    `total_time` INTEGER NOT NULL DEFAULT 0,
    `total_death` INTEGER NOT NULL DEFAULT 0,
    `total_kill` INTEGER NOT NULL DEFAULT 0,
    `total_connect` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`steam_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_users_data_request` (
    `id` CHAR(36) NOT NULL,
    `discordID` VARCHAR(255) NOT NULL,
    `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
    `expirationDate` DATETIME(0) NOT NULL,
    `downloadLink` VARCHAR(255) NULL,
    `code` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `discordID`(`discordID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_users_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `discordID` VARCHAR(255) NOT NULL,
    `type` VARCHAR(255) NOT NULL,
    `message` VARCHAR(255) NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `discordID`(`discordID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `steamID64` VARCHAR(255) NOT NULL,
    `steamID` VARCHAR(255) NOT NULL DEFAULT '',
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `lastIP` VARCHAR(255) NOT NULL DEFAULT '',
    `IPS` LONGTEXT NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`steamID64`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServerStatus` ADD CONSTRAINT `ServerStatus_ibfk_1` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_auto_roles` ADD CONSTRAINT `gm_guild_auto_roles_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_not_verify_role` ADD CONSTRAINT `gm_guild_not_verify_role_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_premium` ADD CONSTRAINT `gm_guild_premium_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_settings` ADD CONSTRAINT `gm_guild_settings_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_verify_msg` ADD CONSTRAINT `gm_guild_verify_msg_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_verify_role` ADD CONSTRAINT `gm_guild_verify_role_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_role_auto` ADD CONSTRAINT `gm_role_auto_ibfk_1` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server` ADD CONSTRAINT `gm_server_ibfk_1` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_customValues` ADD CONSTRAINT `gm_server_customValues_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_errors` ADD CONSTRAINT `gm_server_errors_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_leaderboard_options` ADD CONSTRAINT `gm_server_leaderboard_options_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_links` ADD CONSTRAINT `gm_server_links_ibfk_1` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_logs` ADD CONSTRAINT `gm_server_logs_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_logs_channel` ADD CONSTRAINT `gm_server_logs_channel_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_pseudo` ADD CONSTRAINT `gm_server_pseudo_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_report_bugs` ADD CONSTRAINT `gm_server_report_bugs_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_roles` ADD CONSTRAINT `gm_server_roles_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_screenshot_channels` ADD CONSTRAINT `gm_server_screenshot_channels_ibfk_1` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_screenshots` ADD CONSTRAINT `gm_server_screenshots_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_settings` ADD CONSTRAINT `gm_server_settings_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat` ADD CONSTRAINT `gm_server_stat_ibfk_1` FOREIGN KEY (`server_id`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat` ADD CONSTRAINT `gm_server_stat_ibfk_2` FOREIGN KEY (`steam_id`) REFERENCES `gm_user_steam`(`steam_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat_session` ADD CONSTRAINT `gm_server_stat_session_ibfk_489` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat_session` ADD CONSTRAINT `gm_server_stat_session_ibfk_490` FOREIGN KEY (`steamID64`) REFERENCES `gm_user_steam`(`steam_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_status` ADD CONSTRAINT `gm_server_status_ibfk_1` FOREIGN KEY (`id`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_sync_chat_filter` ADD CONSTRAINT `gm_server_sync_chat_filter_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_sync_roles` ADD CONSTRAINT `gm_server_sync_roles_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_vote` ADD CONSTRAINT `gm_server_vote_ibfk_347` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_vote` ADD CONSTRAINT `gm_server_vote_ibfk_348` FOREIGN KEY (`userID`) REFERENCES `gm_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_vote_channels` ADD CONSTRAINT `gm_server_vote_channels_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_warn` ADD CONSTRAINT `gm_server_warn_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_warn_options` ADD CONSTRAINT `gm_server_warn_options_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_status` ADD CONSTRAINT `gm_status_ibfk_1` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_status_button` ADD CONSTRAINT `gm_status_button_ibfk_1` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_sync_chat` ADD CONSTRAINT `gm_sync_chat_ibfk_1` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_sync_chat` ADD CONSTRAINT `gm_sync_chat_ibfk_2` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_users_data_request` ADD CONSTRAINT `gm_users_data_request_ibfk_1` FOREIGN KEY (`discordID`) REFERENCES `gm_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_users_notifications` ADD CONSTRAINT `gm_users_notifications_ibfk_1` FOREIGN KEY (`discordID`) REFERENCES `gm_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

