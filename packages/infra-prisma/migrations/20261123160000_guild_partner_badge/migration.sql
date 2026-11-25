-- Partnership is a platform-managed designation, separate from Premium entitlements.
ALTER TABLE `gm_guild` ADD COLUMN `isPartner` BOOLEAN NOT NULL DEFAULT false;
