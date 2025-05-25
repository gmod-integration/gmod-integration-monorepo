import { QueryInput, QuerySchema } from '../../schemas/db/QuerySchema.js';

export class Query {
  public readonly offset: number;
  public readonly limit: number;
  public readonly sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  public readonly filter?: {
    field: string;
    comparator: 'equal' | 'not_equal' | 'greater_than' | 'less_than' | 'contains' | 'starts_with' | 'ends_with';
    value: any;
  };

  private constructor(data: QueryInput) {
    const parsed = QuerySchema.parse(data);
    this.offset = parsed.offset;
    this.limit = parsed.limit;
    this.sort = parsed.sort ? { field: parsed.sort.field, order: parsed.sort.order } : undefined;
    this.filter = parsed.filter
      ? {
          field: parsed.filter.field,
          comparator: parsed.filter.comparator,
          value: parsed.filter.value,
        }
      : undefined;
  }

  public static from(data: unknown): Query {
    return new Query(data as QueryInput);
  }
}
