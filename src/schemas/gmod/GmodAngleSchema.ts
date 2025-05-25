import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const GmodAngleSchema = z
  .object({
    p: z.number().openapi({
      example: 0,
      description: 'Pitch',
    }),
    y: z.number().openapi({
      example: 0,
      description: 'Yaw',
    }),
    r: z.number().openapi({
      example: 0,
      description: 'Roll',
    }),
  })
  .openapi({ ref: 'Angle' });

export type GmodAngleInput = z.infer<typeof GmodAngleSchema>;
