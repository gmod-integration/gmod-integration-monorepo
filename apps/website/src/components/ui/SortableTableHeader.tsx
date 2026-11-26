import { Button } from './Button.js'
import { Icon } from './Icon.js'

export interface SortableTableHeaderProps {
  label: string
  active: boolean
  direction: 'ASC' | 'DESC'
  onSort: () => void
}

export function SortableTableHeader(props: SortableTableHeaderProps) {
  return (
    <th scope="col" aria-sort={props.active ? (props.direction === 'ASC' ? 'ascending' : 'descending') : undefined}>
      <Button variant="ghost" size="sm" class="ui-table-sort" onClick={props.onSort}>
        {props.label}
        <Icon
          name={props.active ? (props.direction === 'ASC' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}
          size={14}
        />
      </Button>
    </th>
  )
}
