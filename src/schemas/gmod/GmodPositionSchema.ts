import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const GmodPositionSchema = z
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

export type GmodPositionInput = z.infer<typeof GmodPositionSchema>;
