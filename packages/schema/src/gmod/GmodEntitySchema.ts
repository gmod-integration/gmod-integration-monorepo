import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';
import { GmodAngleSchema } from './GmodAngleSchema.js';
import { GmodPositionSchema } from './GmodPositionSchema.js';

extendZodWithOpenApi(z);

export const GmodEntitySchema = z
  .object({
    class: z.string().openapi({
      example: 'prop_physics',
      description: 'Class of the entity',
    }),
    model: z.string().openapi({
      example: 'models/props_c17/oildrum001.mdl',
      description: 'Model of the entity',
    }),
    position: GmodPositionSchema,
    angle: GmodAngleSchema,
  })
  .openapi({ ref: 'Entity' });

export type GmodEntityInput = z.infer<typeof GmodEntitySchema>;
