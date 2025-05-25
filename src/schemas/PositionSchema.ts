import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const PositionSchema = z
  .object({
    x: z.number().openapi({
      example: 0,
      description: 'X coordinate',
    }),
    y: z.number().openapi({
      example: 0,
      description: 'Y coordinate',
    }),
    z: z.number().openapi({
      example: 0,
      description: 'Z coordinate',
    }),
  })
  .openapi({ ref: 'Position' });

export type PositionInput = z.infer<typeof PositionSchema>;
