import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const CustomValuesSchema = z
  .object({
    customValues: z.record(z.string(), z.any()).openapi({
      example: {
        level: 1,
        policeRank: 'Officer',
      },
      description: 'Custom values for the server',
    }),
  })
  .openapi({ ref: 'Custom Values' });

export type CustomValuesInput = z.infer<typeof CustomValuesSchema>;
