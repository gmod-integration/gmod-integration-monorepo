-- Existing sessions retain their original deadline until explicitly exchanged by their owner.
ALTER TABLE `gm_panelToken`
  ADD COLUMN `absoluteExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `lastSeenAt` DATETIME(3) NULL,
  ADD COLUMN `actorDiscordID` VARCHAR(255) NULL,
  ADD COLUMN `actorSessionID` CHAR(36) NULL;

CREATE INDEX `gm_panelToken_discordID_revoke_expirationDate_idx`
  ON `gm_panelToken` (`discordID`, `revoke`, `expirationDate`);
CREATE INDEX `gm_panelToken_actorSessionID_idx` ON `gm_panelToken` (`actorSessionID`);

ALTER TABLE `gm_discordToken`
  MODIFY `accessToken` TEXT NOT NULL,
  MODIFY `refreshToken` TEXT NOT NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;
