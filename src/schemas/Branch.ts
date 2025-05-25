import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const BranchSchema = z
  .object({
    branch: z.enum(['unknown', 'dev', 'prerelease', 'x86-64']).openapi({
      example: 'unknown',
      description: 'Branch of the player',
    }),
  })
  .openapi({ ref: 'Branch' });

export type BranchInput = z.infer<typeof BranchSchema>;
