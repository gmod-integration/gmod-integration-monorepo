import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZodWithOpenApi(z);

export const QuerySchema = z
  .object({
    offset: z.number().openapi({
      example: 0,
      description: 'Offset for pagination',
    }),
    limit: z.number().max(500).openapi({
      example: 10,
      description: 'Limit for pagination',
    }),
    sort: z
      .object({
        field: z.string().openapi({
          example: 'name',
          description: 'Field to sort by',
        }),
        order: z.enum(['asc', 'desc']).openapi({
          example: 'asc',
          description: 'Order of sorting',
        }),
      })
      .optional()
      .openapi({
        description: 'Sorting options',
      }),
    filter: z
      .object({
        field: z.string().openapi({
          example: 'status',
          description: 'Field to filter by',
        }),
        comparator: z
          .enum(['equal', 'not_equal', 'greater_than', 'less_than', 'contains', 'starts_with', 'ends_with'])
          .openapi({
            example: 'equal',
            description: 'Comparator for filtering',
          }),
        value: z.any().openapi({
          example: 'active',
          description: 'Value to filter by',
        }),
      })
      .optional()
      .openapi({
        description: 'Filtering options',
      }),
  })
  .openapi({ ref: 'Query' });

export type QueryInput = z.infer<typeof QuerySchema>;
