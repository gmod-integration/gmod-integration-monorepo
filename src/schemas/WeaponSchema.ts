import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const WeaponSchema = z
  .object({
    class: z.string().openapi({
      example: 'prop_physics',
      description: 'Class of the Weapon',
    }),
    printName: z.string().openapi({
      example: 'Weapon',
      description: 'Print name of the Weapon',
    }),
  })
  .openapi({ ref: 'Weapon' });

export type WeaponInput = z.infer<typeof WeaponSchema>;
