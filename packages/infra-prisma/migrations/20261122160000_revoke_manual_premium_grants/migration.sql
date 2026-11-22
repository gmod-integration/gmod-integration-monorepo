-- Retain legacy purchase evidence when an administrator revokes a local Premium grant.
-- Existing grants stay active; only new administrative revocations set this flag.
ALTER TABLE `gm_guild_premium`
  ADD COLUMN `revoked` BOOLEAN NOT NULL DEFAULT false;
