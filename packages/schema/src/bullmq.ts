import { z } from 'zod';

/**
 * Job: Synchroniser le pseudo Discord d'un joueur Gmod
 * Source: Gmod server -> Discord pseudonyme/nickname
 */
export const UpdateGuildUserPseudoJobSchema = z.object({
  serverID: z.string().min(1, 'serverID required'),
  steamID64: z.string().min(1, 'steamID64 required'),
  playerName: z.string().min(1, 'playerName required'),
  userGroup: z.string().min(1, 'userGroup required'),
  forceName: z.string().optional(),

  // Metadata
  correlationId: z.string().optional(),
  timestamp: z.coerce.date().optional(),
});

export type UpdateGuildUserPseudoJob = z.infer<typeof UpdateGuildUserPseudoJobSchema>;

/**
 * Job: Synchroniser le groupe/rôle Discord d'un joueur Gmod
 * Source: Gmod server -> Discord role assignment
 */
export const UpdatePlayerUserGroupJobSchema = z.object({
  serverID: z.string().min(1, 'serverID required'),
  steamID64: z.string().min(1, 'steamID64 required'),
  userGroup: z.string().min(1, 'userGroup required'),

  // Metadata
  correlationId: z.string().optional(),
  timestamp: z.coerce.date().optional(),
});

export type UpdatePlayerUserGroupJob = z.infer<typeof UpdatePlayerUserGroupJobSchema>;

/**
 * Job: Synchroniser le role team Discord d'un joueur Gmod
 * Source: Gmod server -> Discord team role assignment
 */
export const UpdateDiscordTeamRoleJobSchema = z.object({
  serverID: z.string().min(1, 'serverID required'),
  steamID64: z.string().min(1, 'steamID64 required'),
  teamName: z.string().optional().nullable(), // null = remove role

  // Metadata
  correlationId: z.string().optional(),
  timestamp: z.coerce.date().optional(),
});

export type UpdateDiscordTeamRoleJob = z.infer<typeof UpdateDiscordTeamRoleJobSchema>;

/**
 * Result/Reply schema pour les jobs en attente
 */
export const DiscordJobResultSchema = z.object({
  correlationId: z.string(),
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export type DiscordJobResult = z.infer<typeof DiscordJobResultSchema>;

export const MainClientHasGuildJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type MainClientHasGuildJob = z.infer<typeof MainClientHasGuildJobSchema>;

export const MainClientHasGuildReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  hasGuild: z.boolean(),
});

export type MainClientHasGuildReply = z.infer<typeof MainClientHasGuildReplySchema>;

export const MainClientUploadScreenshotJobSchema = z.object({
  channelID: z.string().min(1, 'channelID required'),
  content: z.string().min(1, 'content required'),
  minioKey: z.string().min(1, 'minioKey required'),
  fileName: z.string().min(1, 'fileName required'),
  contentType: z.string().min(1, 'contentType required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type MainClientUploadScreenshotJob = z.infer<typeof MainClientUploadScreenshotJobSchema>;

export const MainClientUploadScreenshotReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  discordUrl: z.string(),
});

export type MainClientUploadScreenshotReply = z.infer<typeof MainClientUploadScreenshotReplySchema>;

export const MainClientFetchUserJobSchema = z.object({
  discordID: z.string().min(1, 'discordID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type MainClientFetchUserJob = z.infer<typeof MainClientFetchUserJobSchema>;

export const MainClientFetchUserReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  user: z
    .object({
      id: z.string(),
      username: z.string(),
      displayName: z.string(),
      avatarURL: z.string().nullable(),
    })
    .nullable(),
});

export type MainClientFetchUserReply = z.infer<typeof MainClientFetchUserReplySchema>;

export const MainClientSyncPremiumRolesJobSchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type MainClientSyncPremiumRolesJob = z.infer<typeof MainClientSyncPremiumRolesJobSchema>;

export const MainClientSyncPremiumRolesReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  synced: z.boolean(),
});

export type MainClientSyncPremiumRolesReply = z.infer<typeof MainClientSyncPremiumRolesReplySchema>;

export const MainClientSetPresenceJobSchema = z.object({
  activityName: z.string().min(1, 'activityName required'),
  activityType: z.number().int().optional(),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type MainClientSetPresenceJob = z.infer<typeof MainClientSetPresenceJobSchema>;

export const MainClientSetPresenceReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  updated: z.boolean(),
});

export type MainClientSetPresenceReply = z.infer<typeof MainClientSetPresenceReplySchema>;

export const DiscordGuildChannelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  position: z.number().nullable(),
  parentID: z.string().nullable(),
  sendable: z.boolean(),
  textBased: z.boolean(),
});

export type DiscordGuildChannelSummary = z.infer<typeof DiscordGuildChannelSummarySchema>;

export const DiscordGuildRoleSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  color: z.number(),
  colorHex: z.string(),
  managed: z.boolean(),
  editable: z.boolean(),
});

export type DiscordGuildRoleSummary = z.infer<typeof DiscordGuildRoleSummarySchema>;

export const DiscordGuildEmojiSummarySchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  url: z.string(),
});

export type DiscordGuildEmojiSummary = z.infer<typeof DiscordGuildEmojiSummarySchema>;

export const DiscordGuildSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  ownerID: z.string(),
  preferredLocale: z.string(),
  channels: z.array(DiscordGuildChannelSummarySchema),
  roles: z.array(DiscordGuildRoleSummarySchema),
  emojis: z.array(DiscordGuildEmojiSummarySchema),
});

export type DiscordGuildSummary = z.infer<typeof DiscordGuildSummarySchema>;

export const DiscordGuildSnapshotJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildSnapshotJob = z.infer<typeof DiscordGuildSnapshotJobSchema>;

export const DiscordGuildSnapshotReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  guild: DiscordGuildSummarySchema.nullable(),
});

export type DiscordGuildSnapshotReply = z.infer<typeof DiscordGuildSnapshotReplySchema>;

export const DiscordGuildVerifyUserJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  userID: z.string().min(1, 'userID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildVerifyUserJob = z.infer<typeof DiscordGuildVerifyUserJobSchema>;

export const DiscordGuildVerifyUserReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  verified: z.boolean(),
});

export type DiscordGuildVerifyUserReply = z.infer<typeof DiscordGuildVerifyUserReplySchema>;

export const DiscordGuildRunVerificationCheckJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildRunVerificationCheckJob = z.infer<typeof DiscordGuildRunVerificationCheckJobSchema>;

export const DiscordGuildRunVerificationCheckReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  processed: z.number().int().min(0),
});

export type DiscordGuildRunVerificationCheckReply = z.infer<typeof DiscordGuildRunVerificationCheckReplySchema>;

export const DiscordCreateVerificationMessageJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  channelID: z.string().min(1, 'channelID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordCreateVerificationMessageJob = z.infer<typeof DiscordCreateVerificationMessageJobSchema>;

export const DiscordCreateVerificationMessageReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  verifyMessage: z
    .object({
      guildID: z.string(),
      channelID: z.string(),
      messageID: z.string(),
    })
    .nullable(),
  error: z.string().optional(),
});

export type DiscordCreateVerificationMessageReply = z.infer<typeof DiscordCreateVerificationMessageReplySchema>;

export const DiscordDeleteVerificationMessageJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  channelID: z.string().min(1, 'channelID required'),
  messageID: z.string().min(1, 'messageID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordDeleteVerificationMessageJob = z.infer<typeof DiscordDeleteVerificationMessageJobSchema>;

export const DiscordDeleteVerificationMessageReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  deleted: z.boolean(),
});

export type DiscordDeleteVerificationMessageReply = z.infer<typeof DiscordDeleteVerificationMessageReplySchema>;

export const DiscordGuildBotClientInfoJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildBotClientInfoJob = z.infer<typeof DiscordGuildBotClientInfoJobSchema>;

export const DiscordGuildBotClientInfoReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  botInfo: z
    .object({
      id: z.string(),
      username: z.string(),
      avatar: z.string().nullable(),
      custom: z.boolean(),
      onGuild: z.boolean(),
    })
    .nullable(),
});

export type DiscordGuildBotClientInfoReply = z.infer<typeof DiscordGuildBotClientInfoReplySchema>;

export const DiscordGuildReloadBotInstanceJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildReloadBotInstanceJob = z.infer<typeof DiscordGuildReloadBotInstanceJobSchema>;

export const DiscordGuildReloadBotInstanceReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  reloaded: z.boolean(),
});

export type DiscordGuildReloadBotInstanceReply = z.infer<typeof DiscordGuildReloadBotInstanceReplySchema>;

export const DiscordGuildUpdateBotProfileJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  username: z.string().optional(),
  avatar: z.string().optional(),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildUpdateBotProfileJob = z.infer<typeof DiscordGuildUpdateBotProfileJobSchema>;

export const DiscordGuildUpdateBotProfileReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  updated: z.boolean(),
  error: z.string().optional(),
});

export type DiscordGuildUpdateBotProfileReply = z.infer<typeof DiscordGuildUpdateBotProfileReplySchema>;

export const DiscordGuildSyncBanJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  oldDiscordIDs: z.array(z.string().min(1)).min(1),
  newDiscordID: z.string().min(1, 'newDiscordID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildSyncBanJob = z.infer<typeof DiscordGuildSyncBanJobSchema>;

export const DiscordGuildSyncBanReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  synced: z.boolean(),
});

export type DiscordGuildSyncBanReply = z.infer<typeof DiscordGuildSyncBanReplySchema>;

export const DiscordGuildAdminsJobSchema = z.object({
  guildID: z.string().min(1, 'guildID required'),
  correlationId: z.string().min(1, 'correlationId required'),
  timestamp: z.coerce.date().optional(),
});

export type DiscordGuildAdminsJob = z.infer<typeof DiscordGuildAdminsJobSchema>;

export const DiscordGuildAdminsReplySchema = z.object({
  correlationId: z.string().min(1, 'correlationId required'),
  admins: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      avatar: z.string().nullable(),
    }),
  ),
});

export type DiscordGuildAdminsReply = z.infer<typeof DiscordGuildAdminsReplySchema>;
