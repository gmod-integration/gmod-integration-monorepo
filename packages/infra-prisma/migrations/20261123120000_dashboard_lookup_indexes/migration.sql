-- Authentication resolves every dashboard request by its bearer credential or session-cookie hash.
CREATE INDEX `gm_panelToken_accessToken_revoke_expirationDate_idx`
  ON `gm_panelToken` (`accessToken`, `revoke`, `expirationDate`);

-- Guild access resolution selects an assigned, non-revoked purchase on cache misses.
CREATE INDEX `gm_gmodstore_purchases_guild_revoke_idx`
  ON `gm_gmodstore_purchases` (`guild`, `revoke`);
