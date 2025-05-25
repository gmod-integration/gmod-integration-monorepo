import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';
import { PlayerSchema } from './PlayerSchema.js';

extendZodWithOpenApi(z);

export const ServerSchema = z
  .object({
    hostname: z.string().openapi({
      example: 'My Server',
      description: 'Name of the server',
    }),
    ip: z.string().openapi({
      example: '127.0.0.0',
      description: 'IP of the server',
    }),
    port: z.number().openapi({
      example: 27015,
      description: 'Port of the server',
    }),
    map: z.string().openapi({
      example: 'gm_construct',
      description: 'Map of the server',
    }),
    players: z.number().openapi({
      example: 0,
      description: 'Number of players on the server',
    }),
    playersList: z.array(PlayerSchema),
    maxPlayers: z.number().openapi({
      example: 16,
      description: 'Max players on the server',
    }),
    gameMode: z.string().openapi({
      example: 'Sandbox',
      description: 'Game mode of the server',
    }),
    uptime: z.number().openapi({
      example: 0,
      description: 'Uptime of the server',
    }),
  })
  .openapi({ ref: 'Server' });

export type ServerInput = z.infer<typeof ServerSchema>;
