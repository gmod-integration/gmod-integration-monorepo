import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const ServerSchema = z
  .object({
    token: z.string().openapi({
      description: 'Unique token for the server',
      example: 'abc123',
    }),
    id: z.string().openapi({
      description: 'Unique identifier for the server',
      example: 'server-001',
    }),
    guild: z.string().openapi({
      description: 'Guild or community associated with the server',
      example: 'MyGamingGuild',
    }),
    name: z.string().openapi({
      description: 'Name of the server',
      example: 'My Awesome Server',
    }),
    ip: z.string().openapi({
      description: 'IP address of the server',
      example: '127.0.0.0',
    }),
    port: z.string().openapi({
      description: 'Port number of the server',
      example: '27015',
    }),
    image: z.string().openapi({
      description: 'Image URL for the server',
      example: 'https://example.com/server-image.png',
    }),
    verified: z.boolean().openapi({
      description: 'Indicates if the server is verified',
      example: true,
    }),
    publicTempToken: z.string().openapi({
      description: 'Temporary public token for the server',
      example: 'temp-xyz789',
    }),
    description: z.string().openapi({
      description: 'Description of the server',
      example: 'This is a great server for gaming and fun!',
    }),
    isPublic: z.boolean().openapi({
      description: 'Indicates if the server is public',
      example: true,
    }),
  })
  .openapi({ ref: 'Server' });

export type ServerInput = z.infer<typeof ServerSchema>;
