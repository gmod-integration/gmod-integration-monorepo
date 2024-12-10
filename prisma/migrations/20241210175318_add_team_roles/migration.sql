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
CREATE TABLE `gm_server_sync_team_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `roleID` VARCHAR(255) NOT NULL,
    `teamName` VARCHAR(255) NOT NULL DEFAULT '',
    `enable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serverID`(`serverID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gm_server_sync_team_roles` ADD CONSTRAINT `gm_server_sync_team_roles_serverID_fkey` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
