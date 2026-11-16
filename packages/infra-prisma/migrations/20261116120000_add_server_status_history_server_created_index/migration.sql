-- Status charts query the last 24h of history for one server. With only the
-- serverID index, MariaDB scanned and filesorted ~1M rows per busy server (~46s).
-- InnoDB builds secondary indexes online (no table lock).
CREATE INDEX `gm_server_status_history_serverID_createdAt_idx` ON `gm_server_status_history`(`serverID`, `createdAt`);
