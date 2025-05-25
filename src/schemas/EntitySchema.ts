import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';
import { PositionSchema } from './PositionSchema.js';
import { AngleSchema } from './AngleSchema.js';

extendZodWithOpenApi(z);

export const EntitySchema = z
  .object({
    class: z.string().openapi({
      example: 'prop_physics',
      description: 'Class of the entity',
    }),
    model: z.string().openapi({
      example: 'models/props_c17/oildrum001.mdl',
      description: 'Model of the entity',
    }),
    position: PositionSchema,
    angle: AngleSchema,
  })
  .openapi({ ref: 'Entity' });

export type EntityInput = z.infer<typeof EntitySchema>;
