-- AlterTable
ALTER TABLE `banUsers` MODIFY `unbanDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 2 YEAR);

-- AlterTable
ALTER TABLE `gm_discordToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_panelToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_user` MODIFY `token_expires` DATETIME(3) NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_users_data_request` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 1 DAY);

-- CreateTable
CREATE TABLE `gm_guild_webooks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild` VARCHAR(255) NOT NULL,
    `channelID` VARCHAR(255) NOT NULL,
    `webhookID` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guild`(`guild`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gm_server_logs_triggers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `log_type` VARCHAR(255) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `operator` ENUM('equal', 'notEqual', 'contain', 'notContain', 'startWith', 'endWith') NOT NULL DEFAULT 'equal',
    `action` ENUM('sendInChannel', 'sendInDMToAdmins') NOT NULL DEFAULT 'sendInChannel',
    `channelID` VARCHAR(255) NOT NULL DEFAULT '',
    `adminIDS` JSON NOT NULL,
    `message` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `serverID` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gm_guild_webooks` ADD CONSTRAINT `gm_guild_webooks_guild_fkey` FOREIGN KEY (`guild`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gm_server_logs_triggers` ADD CONSTRAINT `gm_server_logs_triggers_serverID_fkey` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
