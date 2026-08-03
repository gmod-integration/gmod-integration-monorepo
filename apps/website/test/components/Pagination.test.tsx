import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import Pagination from '../../src/components/Pagination.js'
import { QuerySort, type ClientQuery } from '../../src/utils/types/QueryTypes.js'

afterEach(() => cleanup())

function baseQuery(overrides: Partial<ClientQuery> = {}): ClientQuery {
  return {
    limit: 25,
    offset: 0,
    sort: 'id',
    orderBy: QuerySort.ASC,
    ...overrides,
  }
}

function renderTable(query: ClientQuery, total: number, onChange: (q: ClientQuery) => void, colSpan?: number) {
  return render(() => (
    <table>
      <tbody>
        <Pagination query={query} total={total} onChange={onChange} colSpan={colSpan} />
      </tbody>
    </table>
  ))
}

describe('components/Pagination.tsx', () => {
  it('renders the current page / total pages', () => {
    renderTable(baseQuery(), 100, vi.fn())
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
  })

  it('uses colSpan default of 6 when not provided', () => {
    const { container } = renderTable(baseQuery(), 100, vi.fn())
    expect(container.querySelector('td')).toHaveAttribute('colspan', '6')
  })

  it('uses a custom colSpan when provided', () => {
    const { container } = renderTable(baseQuery(), 100, vi.fn(), 3)
    expect(container.querySelector('td')).toHaveAttribute('colspan', '3')
  })

  it('falls back to 1 total page when total is 0', () => {
    renderTable(baseQuery({ offset: 0 }), 0, vi.fn())
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('disables the prev button on the first page and enables it after', () => {
    const { container } = renderTable(baseQuery({ offset: 0 }), 100, vi.fn())
    const buttons = container.querySelectorAll('button')
    const prevBtn = buttons[0]
    const nextBtn = buttons[2]
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()
  })

  it('disables the next button on the last page', () => {
    const { container } = renderTable(baseQuery({ offset: 75, limit: 25 }), 100, vi.fn())
    const buttons = container.querySelectorAll('button')
    const nextBtn = buttons[2]
    expect(nextBtn).toBeDisabled()
  })

  it('calls onChange with a decremented offset when prev is clicked', () => {
    const onChange = vi.fn()
    const { container } = renderTable(baseQuery({ offset: 50, limit: 25 }), 100, onChange)
    const prevBtn = container.querySelectorAll('button')[0]
    fireEvent.click(prevBtn)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }))
  })

  it('does nothing when prev is clicked while already on the first page', () => {
    const onChange = vi.fn()
    const { container } = renderTable(baseQuery({ offset: 0 }), 100, onChange)
    const prevBtn = container.querySelectorAll('button')[0]
    fireEvent.click(prevBtn)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange with an incremented offset when next is clicked', () => {
    const onChange = vi.fn()
    const { container } = renderTable(baseQuery({ offset: 0, limit: 25 }), 100, onChange)
    const nextBtn = container.querySelectorAll('button')[2]
    fireEvent.click(nextBtn)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }))
  })

  it('does nothing when next is clicked while already on the last page', () => {
    const onChange = vi.fn()
    const { container } = renderTable(baseQuery({ offset: 75, limit: 25 }), 100, onChange)
    const nextBtn = container.querySelectorAll('button')[2]
    fireEvent.click(nextBtn)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('resets the offset to 0 when the page-number button is clicked', () => {
    const onChange = vi.fn()
    const { container } = renderTable(baseQuery({ offset: 50, limit: 25 }), 100, onChange)
    const resetBtn = container.querySelectorAll('button')[1]
    fireEvent.click(resetBtn)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }))
  })

  it('changes the limit and resets offset to 0 when the select value changes', () => {
    const onChange = vi.fn()
    const { container } = renderTable(baseQuery({ offset: 50, limit: 25 }), 100, onChange)
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }))
  })
})
