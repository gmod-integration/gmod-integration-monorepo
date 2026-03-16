-- CreateTable
CREATE TABLE `gm_server_status_channel` (
    `id` CHAR(36) NOT NULL,
    `server` VARCHAR(255) NOT NULL,
    `channelID` VARCHAR(255) NOT NULL DEFAULT '',
    `format` VARCHAR(255) NOT NULL DEFAULT '%s players',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `gm_server_status_channel_server_id_fk`(`server`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gm_server_status_channel` ADD CONSTRAINT `gm_server_status_channel_ibfk_1` FOREIGN KEY (`server`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
