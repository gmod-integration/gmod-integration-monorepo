-- CreateTable
CREATE TABLE `banUsers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `steamID64` VARCHAR(255) NOT NULL DEFAULT '',
    `ip` VARCHAR(255) NOT NULL DEFAULT '',
    `discordID` VARCHAR(255) NOT NULL DEFAULT '',
    `reason` VARCHAR(255) NOT NULL DEFAULT '',
    `banDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `banTime` INTEGER NOT NULL DEFAULT 0,
    `unbanDate` DATETIME(3) NOT NULL DEFAULT (current_timestamp() + interval 2 year),
    `admin` VARCHAR(255) NOT NULL DEFAULT '',
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `permanent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_discordToken` (
    `discordID` CHAR(255) NOT NULL,
    `accessToken` VARCHAR(255) NOT NULL,
    `refreshToken` VARCHAR(255) NOT NULL,
    `creationDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expirationDate` DATETIME(3) NOT NULL DEFAULT (current_timestamp() + interval 7 day),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`discordID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_gmodstore_purchases` (
    `steamID64` VARCHAR(255) NOT NULL,
    `guild` VARCHAR(255) NOT NULL DEFAULT '',
    `token` VARCHAR(255) NOT NULL DEFAULT '',
    `revoke` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userID` VARCHAR(255) NOT NULL DEFAULT '',

    PRIMARY KEY (`steamID64`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild` (
    `guild` CHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `member` INTEGER NOT NULL DEFAULT 0,
    `language` VARCHAR(255) NOT NULL DEFAULT 'en',
    `addDate` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guild`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_auto_roles` (
    `guildID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guildID`(`guildID`),
    PRIMARY KEY (`roleID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_member` (
    `guild_id` CHAR(255) NOT NULL,
    `user_id` CHAR(255) NOT NULL,
    `date` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`guild_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_premium` (
    `guildID` VARCHAR(255) NOT NULL,
    `transaction` TEXT NULL,
    `buyer` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guildID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_settings` (
    `guildID` CHAR(255) NOT NULL,
    `setting` CHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guildID`, `setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_verify_msg` (
    `guildID` VARCHAR(255) NOT NULL,
    `messageID` VARCHAR(255) NOT NULL,
    `channelID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guildID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_guild_verify_role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `isGiveRole` BOOLEAN NOT NULL DEFAULT true,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guildID`(`guildID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_panelToken` (
    `id` CHAR(36) NOT NULL,
    `discordID` VARCHAR(255) NOT NULL,
    `accessToken` VARCHAR(255) NOT NULL,
    `os` VARCHAR(255) NULL,
    `ip` VARCHAR(255) NULL,
    `country` VARCHAR(255) NULL,
    `browser` VARCHAR(255) NULL,
    `creationDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expirationDate` DATETIME(3) NOT NULL DEFAULT (current_timestamp() + interval 7 day),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_role_auto` (
    `guild` CHAR(255) NOT NULL,
    `id` VARCHAR(255) NOT NULL,
    `channel` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guild`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server` (
    `id` CHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `publicTempToken` VARCHAR(255) NULL DEFAULT '',
    `guild` CHAR(255) NOT NULL,
    `ip` VARCHAR(255) NULL DEFAULT '127.0.0.1',
    `port` VARCHAR(255) NULL DEFAULT '27015',
    `name` VARCHAR(255) NULL DEFAULT 'New Gmod Server',
    `image` VARCHAR(255) NULL DEFAULT '',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `bump` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `description` VARCHAR(255) NULL DEFAULT '',
    `isPublic` BOOLEAN NOT NULL DEFAULT false,

    INDEX `guild`(`guild`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_customValues` (
    `serverID` CHAR(255) NULL,
    `value` CHAR(255) NULL,
    `enable` TINYINT NULL,
    `valueName` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

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
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_leaderboard_options` (
    `serverID` CHAR(17) NOT NULL,
    `messageID` CHAR(255) NOT NULL,
    `category` VARCHAR(255) NOT NULL DEFAULT '',
    `limitValue` INTEGER NOT NULL DEFAULT 10,
    `offsetValue` INTEGER NOT NULL DEFAULT 0,
    `orderValue` VARCHAR(255) NOT NULL DEFAULT 'DESC',
    `page` INTEGER NOT NULL DEFAULT 1,
    `totalPages` INTEGER NULL,
    `creationDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updateDate` DATETIME(3) NULL,
    `total` INTEGER NULL,
    `totalPage` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `gm_server_leaderboard_options_gm_server_id_fk`(`serverID`),
    PRIMARY KEY (`messageID`, `serverID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` TEXT NOT NULL DEFAULT 'https://example.com',
    `alias` VARCHAR(255) NOT NULL DEFAULT 'Example',
    `guild` VARCHAR(255) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guild`(`guild`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_logs` (
    `serverID` CHAR(255) NULL,
    `type` VARCHAR(255) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `timeStamp` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,
    `playerInvolvedSteamID64` LONGTEXT NULL,

    INDEX `gm_server_logs_gm_server_id_fk`(`serverID`),
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
    `serverID` CHAR(17) NULL,
    `role` VARCHAR(255) NULL,
    `roleName` TEXT NULL,
    `prefix` TEXT NULL,
    `discordRoleID` TEXT NULL,
    `enablePrefix` BOOLEAN NULL DEFAULT false,
    `enableSync` BOOLEAN NULL DEFAULT false,
    `roleID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `gm_server_roles_gm_server_id_fk`(`serverID`),
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
    `serverID` CHAR(255) NOT NULL,
    `setting` CHAR(255) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`serverID`, `setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_stat` (
    `steam_id` CHAR(30) NOT NULL,
    `server_id` CHAR(255) NOT NULL,
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

    INDEX `gm_server_stat_gm_user_steam_steam_id_fk`(`steam_id`),
    PRIMARY KEY (`server_id`, `steam_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_stat_session` (
    `serverID` CHAR(255) NULL,
    `steamID64` CHAR(255) NULL,
    `time` INTEGER NOT NULL DEFAULT 0,
    `deaths` INTEGER NOT NULL DEFAULT 0,
    `kills` INTEGER NOT NULL DEFAULT 0,
    `customValues` TEXT NULL,
    `sessionEndTimeStamp` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,

    INDEX `gm_server_stat_session_1_gm_user_steam_steam_id_fk`(`serverID`),
    INDEX `gm_server_stat_session_gm_user_steam_steam_id_fk`(`steamID64`),
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
    `server` CHAR(255) NULL,
    `name` VARCHAR(255) NOT NULL DEFAULT 'Example',
    `url` TEXT NOT NULL,
    `emoji` VARCHAR(255) NOT NULL DEFAULT '?',
    `enable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `gm_status_button_gm_server_id_fk`(`server`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_sync_chat` (
    `guild` CHAR(255) NOT NULL,
    `channel` VARCHAR(255) NOT NULL DEFAULT '',
    `server` CHAR(255) NOT NULL,
    `id` VARCHAR(255) NOT NULL DEFAULT '',
    `token` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `gm_sync_chat_gm_server_id_fk`(`server`),
    PRIMARY KEY (`guild`, `server`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_user` (
    `id` CHAR(30) NOT NULL,
    `rank` VARCHAR(255) NOT NULL DEFAULT 'user',
    `steam` VARCHAR(255) NULL,
    `email` TEXT NULL,
    `username` TEXT NULL,
    `last_oauth` TIMESTAMP(0) NULL,
    `trust` INTEGER NULL DEFAULT 50,
    `token` VARCHAR(255) NULL,
    `token_expires` DATETIME(0) NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_user_steam` (
    `steam_id` CHAR(30) NOT NULL,
    `username` VARCHAR(255) NOT NULL DEFAULT '',
    `last_ip` VARCHAR(255) NOT NULL DEFAULT '',
    `last_connect` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `total_time` INTEGER NULL DEFAULT 0,
    `total_death` INTEGER NULL DEFAULT 0,
    `total_kill` INTEGER NULL DEFAULT 0,
    `total_connect` INTEGER NULL DEFAULT 1,
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
    `steamID64` CHAR(255) NOT NULL,
    `steamID` TEXT NULL,
    `name` TEXT NULL,
    `lastIP` TEXT NULL,
    `IPS` LONGTEXT NULL,
    `lastUpdate` TIMESTAMP(0) NULL,
    `createdAt` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NOT NULL,

    PRIMARY KEY (`steamID64`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gm_guild_auto_roles` ADD CONSTRAINT `gm_guild_auto_roles_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_verify_msg` ADD CONSTRAINT `gm_guild_verify_msg_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_guild_verify_role` ADD CONSTRAINT `gm_guild_verify_role_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server` ADD CONSTRAINT `gm_server_ibfk_1` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_errors` ADD CONSTRAINT `gm_server_errors_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_leaderboard_options` ADD CONSTRAINT `gm_server_leaderboard_options_gm_server_id_fk` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_links` ADD CONSTRAINT `gm_server_links_ibfk_1` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `gm_server_settings` ADD CONSTRAINT `gm_server_settings_gm_server_id_fk` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat` ADD CONSTRAINT `gm_server_stat_gm_server_id_fk` FOREIGN KEY (`server_id`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat` ADD CONSTRAINT `gm_server_stat_gm_user_steam_steam_id_fk` FOREIGN KEY (`steam_id`) REFERENCES `gm_user_steam`(`steam_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat_session` ADD CONSTRAINT `gm_server_stat_session_ibfk_125` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_stat_session` ADD CONSTRAINT `gm_server_stat_session_ibfk_126` FOREIGN KEY (`steamID64`) REFERENCES `gm_user_steam`(`steam_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_status` ADD CONSTRAINT `gm_server_status_ibfk_1` FOREIGN KEY (`id`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_sync_chat_filter` ADD CONSTRAINT `gm_server_sync_chat_filter_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_sync_roles` ADD CONSTRAINT `gm_server_sync_roles_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_vote` ADD CONSTRAINT `gm_server_vote_ibfk_189` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_vote` ADD CONSTRAINT `gm_server_vote_ibfk_190` FOREIGN KEY (`userID`) REFERENCES `gm_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `gm_sync_chat` ADD CONSTRAINT `gm_sync_chat_gm_server_id_fk` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_sync_chat` ADD CONSTRAINT `gm_sync_chat_ibfk_1` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_users_data_request` ADD CONSTRAINT `gm_users_data_request_ibfk_1` FOREIGN KEY (`discordID`) REFERENCES `gm_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_users_notifications` ADD CONSTRAINT `gm_users_notifications_ibfk_1` FOREIGN KEY (`discordID`) REFERENCES `gm_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

