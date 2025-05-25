import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';
import { TeamSchema } from './TeamSchema.js';
import { PositionSchema } from './PositionSchema.js';
import { AngleSchema } from './AngleSchema.js';
import { CustomValuesSchema } from './CustomValuesSchema.js';
import { BranchSchema } from './Branch.js';

extendZodWithOpenApi(z);

export const PlayerSchema = z
  .object({
    steamID64: z.string().length(17).openapi({
      example: '76561198219049673',
      description: 'Steam ID 64 of the player',
    }),
    steamID: z.string().openapi({
      example: 'STEAM_0:1:129391972',
      description: 'Steam ID of the player',
    }),
    name: z.string().min(1).openapi({
      example: 'Linventif',
      description: 'Name of the player',
    }),
    userGroup: z.string().openapi({
      example: 'superadmin',
      description: 'User group of the player',
    }),
    kills: z.number().openapi({
      example: 0,
      description: 'Number of kills of the player',
    }),
    deaths: z.number().openapi({
      example: 0,
      description: 'Number of deaths of the player',
    }),
    connectTime: z.number().optional().openapi({
      example: 0,
      description: 'Connect time of the player',
    }),
    adjustedTime: z.number().optional().openapi({
      example: 0,
      description: 'Adjusted time of the player',
    }),
    timeLastTeamChange: z.number().optional().openapi({
      example: 0,
      description: 'Time of the last team change of the player',
    }),
    ping: z.number().optional().openapi({
      example: 0,
      description: 'Ping of the player',
    }),
    fps: z.number().optional().openapi({
      example: 0,
      description: 'FPS of the player',
    }),
    branch: BranchSchema.optional(),
    customValues: CustomValuesSchema.optional(),
    team: TeamSchema,
    position: PositionSchema,
    angle: AngleSchema,
  })
  .openapi({ ref: 'Player' });

export const PlayersListSchema = z.array(PlayerSchema);

export type PlayerInput = z.infer<typeof PlayerSchema>;
export type PlayersListInput = z.infer<typeof PlayersListSchema>;
