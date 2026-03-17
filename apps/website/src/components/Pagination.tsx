import { Component } from "solid-js";
import { ClientQuery, QuerySort } from "../utils/types/QueryTypes";

interface PaginationProps {
  query: ClientQuery;
  total: number;
  onChange: (newQuery: ClientQuery) => void;
  colSpan?: number;
}

const Pagination: Component<PaginationProps> = (props) => {
  const currentPage = () => Math.floor(props.query.offset / props.query.limit) + 1;
  const totalPages = () => Math.ceil(props.total / props.query.limit) || 1;

  const canPrev = () => props.query.offset > 0;
  const canNext = () => props.query.offset + props.query.limit < props.total;

  const handlePrev = () => {
    if (!canPrev()) return;
    props.onChange({
      ...props.query,
      offset: props.query.offset - props.query.limit,
    });
  };

  const handleNext = () => {
    if (!canNext()) return;
    props.onChange({
      ...props.query,
      offset: props.query.offset + props.query.limit,
    });
  };

  const handleReset = () => {
    props.onChange({
      ...props.query,
      offset: 0,
    });
  };

  const toggleSort = () => {
    props.onChange({
      ...props.query,
      orderBy: props.query.orderBy === QuerySort.ASC ? QuerySort.DESC : QuerySort.ASC,
    });
  };

  const handleLimitChange = (event: Event) => {
    const newLimit = parseInt((event.target as HTMLSelectElement).value, 10);
    props.onChange({
      ...props.query,
      limit: newLimit,
      offset: 0, // Reset offset when limit changes
    });
  };

  return (
    <tr>
      <td colSpan={props.colSpan ?? 6}>
        <div
          class="
    join flex justify-center
    [&>.join-item]:border-2
    [&>.join-item]:border-base-200
    [&>.join-item:not(:first-child)]:border-l-0
  "
        >
          <button class="btn btn-sm join-item bg-base-200/20" onClick={handlePrev} disabled={!canPrev()}>
            <i class="fa-solid fa-chevron-left"></i>
          </button>

          <button class="btn btn-sm join-item bg-base-200/20" onClick={handleReset}>
            {`${currentPage()} / ${totalPages()}`}
          </button>

          <select class="btn btn-sm join-item bg-base-200/20" onChange={handleLimitChange} value={props.query.limit}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>

          <button class="btn btn-sm join-item bg-base-200/20" onClick={handleNext} disabled={!canNext()}>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </td>
    </tr>
  );
};

export default Pagination;
