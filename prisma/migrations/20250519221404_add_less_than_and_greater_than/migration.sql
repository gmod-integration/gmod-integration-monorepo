-- AlterTable
ALTER TABLE `banUsers` MODIFY `unbanDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 2 YEAR);

-- AlterTable
ALTER TABLE `gm_discordToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_panelToken` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_server_logs_triggers` MODIFY `operator` ENUM('equal', 'greaterThan', 'lessThan', 'notEqual', 'contain', 'notContain', 'startWith', 'endWith') NOT NULL DEFAULT 'equal';

-- AlterTable
ALTER TABLE `gm_user` MODIFY `token_expires` DATETIME(3) NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY);

-- AlterTable
ALTER TABLE `gm_users_data_request` MODIFY `expirationDate` DATETIME(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 1 DAY);
