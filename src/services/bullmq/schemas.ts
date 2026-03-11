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
  timestamp: z.date().optional(),
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
  timestamp: z.date().optional(),
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
  timestamp: z.date().optional(),
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
