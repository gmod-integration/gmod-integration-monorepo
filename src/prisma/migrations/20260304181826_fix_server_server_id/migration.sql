/*
  Warnings:

  - You are about to drop the column `server` on the `gm_server_status_channel` table. All the data in the column will be lost.
  - Added the required column `serverID` to the `gm_server_status_channel` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `gm_server_status_channel` DROP FOREIGN KEY `gm_server_status_channel_ibfk_1`;

-- DropIndex
DROP INDEX `gm_server_status_channel_server_id_fk` ON `gm_server_status_channel`;

-- AlterTable
ALTER TABLE `gm_server_status_channel` DROP COLUMN `server`,
    ADD COLUMN `serverID` VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE INDEX `gm_server_status_channel_server_id_fk` ON `gm_server_status_channel`(`serverID`);

-- AddForeignKey
ALTER TABLE `gm_server_status_channel` ADD CONSTRAINT `gm_server_status_channel_ibfk_1` FOREIGN KEY (`serverID`) REFERENCES `gm_server`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
