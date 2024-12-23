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
CREATE TABLE `gm_guild_verification_check` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `guildID` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guildID`(`guildID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gm_guild_verification_check` ADD CONSTRAINT `gm_guild_verification_check_ibfk_1` FOREIGN KEY (`guildID`) REFERENCES `gm_guild`(`guild`) ON DELETE CASCADE ON UPDATE CASCADE;
