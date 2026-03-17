export enum QuerySort {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum QueryFilterComparator {
  EQUAL = 'equal',
  NOT_EQUAL = 'not_equal',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
}

// This is what you send TO the server (resource source).
// Omit 'total' from here to avoid triggers on setQuery({ total: ... }).
export interface ClientQuery {
  limit: number
  offset: number
  sort: string
  orderBy: QuerySort
  filterField?: string
  filterComparator?: QueryFilterComparator
  filterValue?: unknown
  total?: number // This is not sent to the server, only used in the client.
}

// The server response includes a 'query' that DOES have 'total'.
export interface ServerQuery extends ClientQuery {
  total: number
}
