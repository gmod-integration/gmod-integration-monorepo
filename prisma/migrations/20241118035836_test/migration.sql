/*
  Warnings:

  - You are about to alter the column `customValues` on the `gm_server_stat_session` table. The data in that column could be lost. The data in that column will be cast from `Text` to `Json`.

*/
-- AlterTable
ALTER TABLE `banUsers` MODIFY `unbanDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 2 YEAR);

-- AlterTable
ALTER TABLE `gm_discordToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_panelToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_server_stat_session` MODIFY `customValues` JSON NULL;

-- AlterTable
ALTER TABLE `gm_server_status` ADD COLUMN `playersList` JSON NULL;

-- AlterTable
ALTER TABLE `gm_user` MODIFY `token_expires` DATETIME(3) NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_users_data_request` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 1 DAY);

-- CreateTable
CREATE TABLE `gm_server_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverID` VARCHAR(255) NOT NULL,
    `players` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gm_server_status_history` ADD CONSTRAINT `gm_server_status_history_serverID_fkey` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
