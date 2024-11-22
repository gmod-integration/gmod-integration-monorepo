-- DropForeignKey
ALTER TABLE `gm_server_status_history` DROP FOREIGN KEY `gm_server_status_history_ibfk_1`;

-- AlterTable
ALTER TABLE `banUsers` MODIFY `unbanDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 2 YEAR);

-- AlterTable
ALTER TABLE `gm_discordToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_panelToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_server_status_history` MODIFY `serverID` VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE `gm_user` MODIFY `token_expires` DATETIME(3) NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_users_data_request` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 1 DAY);

-- AddForeignKey
ALTER TABLE `gm_server_status_history` ADD CONSTRAINT `gm_server_status_history_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
