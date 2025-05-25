import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';
import { GmodPlayerSchema } from './GmodPlayerSchema.js';

extendZodWithOpenApi(z);

export const GmodStatusServerSchema = z
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
    playersList: z.array(GmodPlayerSchema),
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
  .openapi({ ref: 'Status Server' });

export type GmodStatusServerInput = z.infer<typeof GmodStatusServerSchema>;
