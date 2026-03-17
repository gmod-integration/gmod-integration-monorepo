import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const QuerySchema = z
  .object({
    offset: z.coerce.number().int().nonnegative().default(0).openapi({
      example: 0,
      description: 'Offset for pagination',
    }),
    limit: z.coerce.number().int().nonnegative().max(500).default(25).openapi({
      example: 25,
      description: 'Limit for pagination',
    }),
    sort: z.string().optional().openapi({
      example: 'createdAt',
      description: 'Field to sort by, e.g., "createdAt" or "name"',
    }),
    orderBy: z.enum(['ASC', 'DESC']).optional().openapi({
      example: 'ASC',
      description: 'Order of sorting, either "ASC" or "DESC"',
    }),
    filterField: z.string().optional().openapi({
      example: 'status',
      description: 'Field to filter by, e.g., "status" or "type"',
    }),
    filterComparator: z
      .enum(['equal', 'not_equal', 'greater_than', 'less_than', 'contains', 'starts_with', 'ends_with'])
      .optional()
      .openapi({
        example: 'equal',
        description: 'Comparator for filtering, e.g., "equal" or "contains"',
      }),
    filterValue: z.any().optional().openapi({
      example: 'active',
      description: 'Value to filter by, e.g., "active" or "error"',
    }),
  })
  .openapi({ ref: 'Query' });

export type QueryInput = z.infer<typeof QuerySchema>;
