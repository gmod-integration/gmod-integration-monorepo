import { type QueryInput, QuerySchema } from '@gmod/schema/db/QuerySchema.js';

export class Query {
  public readonly offset: number;
  public readonly limit: number;
  public readonly sort?: string;
  public readonly orderBy?: 'ASC' | 'DESC';
  public readonly filterField?: string;
  public readonly filterComparator?:
    | 'equal'
    | 'not_equal'
    | 'greater_than'
    | 'less_than'
    | 'contains'
    | 'starts_with'
    | 'ends_with';
  public readonly filterValue?: unknown;

  private constructor(data: QueryInput) {
    const parsed = QuerySchema.parse(data);
    this.offset = parsed.offset;
    this.limit = parsed.limit;
    this.sort = parsed.sort;
    this.orderBy = parsed.orderBy;
    this.filterField = parsed.filterField;
    this.filterComparator = parsed.filterComparator;
    this.filterValue = parsed.filterValue;
  }

  public static from(data: unknown): Query {
    return new Query(data as QueryInput);
  }
}
