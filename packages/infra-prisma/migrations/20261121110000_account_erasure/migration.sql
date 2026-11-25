CREATE TABLE `gm_user_erasure` (
  `id` CHAR(36) NOT NULL,
  `discordSubject` CHAR(64) NOT NULL,
  `steamSubject` CHAR(64) NULL,
  `receiptHash` CHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `reactivatedAt` DATETIME(3) NULL,
  `payload` JSON NULL,
  `progress` JSON NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastError` VARCHAR(64) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `leaseToken` CHAR(36) NULL,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `gm_user_erasure_discordSubject_reactivatedAt_idx` (`discordSubject`, `reactivatedAt`),
  UNIQUE INDEX `gm_user_erasure_receiptHash_key` (`receiptHash`),
  INDEX `gm_user_erasure_steamSubject_idx` (`steamSubject`),
  INDEX `gm_user_erasure_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gm_user_security` (
  `subject` CHAR(64) NOT NULL,
  `trust` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`subject`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
