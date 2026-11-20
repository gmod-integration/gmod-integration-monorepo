import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import Pagination from '../../src/components/Pagination.js'
import { QuerySort, type ClientQuery } from '../../src/utils/types/QueryTypes.js'

afterEach(() => cleanup())
beforeEach(() => window.localStorage.removeItem('locale'))

function baseQuery(overrides: Partial<ClientQuery> = {}): ClientQuery {
  return { limit: 25, offset: 0, sort: 'id', orderBy: QuerySort.ASC, ...overrides }
}

function renderTable(query: ClientQuery, total: number, onChange: (query: ClientQuery) => void, colSpan?: number) {
  return renderWithProviders(() => (
    <table>
      <tbody>
        <Pagination query={query} total={total} onChange={onChange} colSpan={colSpan} />
      </tbody>
    </table>
  ))
}

describe('Pagination controls', () => {
  it('announces pagination and displays the current and total pages', () => {
    renderTable(baseQuery(), 100, vi.fn())
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 / 4' })).toHaveAttribute('title', 'Back to the first page')
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('25')
  })

  it.each([undefined, 3])('spans the configured table columns: %s', (colSpan) => {
    const { container } = renderTable(baseQuery(), 100, vi.fn(), colSpan)
    expect(container.querySelector('td')).toHaveAttribute('colspan', String(colSpan ?? 6))
  })

  it('keeps an empty result on page one with both navigation buttons disabled', () => {
    renderTable(baseQuery(), 0, vi.fn())
    expect(screen.getByRole('button', { name: '1 / 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('decrements the offset while preserving the rest of the query', () => {
    const onChange = vi.fn()
    const query = baseQuery({ offset: 50, filterField: 'name', filterValue: 'Bob' })
    renderTable(query, 100, onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onChange).toHaveBeenCalledWith({ ...query, offset: 25 })
  })

  it('clamps the previous offset to zero for a partial first page', () => {
    const onChange = vi.fn()
    renderTable(baseQuery({ offset: 10 }), 100, onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }))
  })

  it('does not navigate before the first page', () => {
    const onChange = vi.fn()
    renderTable(baseQuery(), 100, onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('increments the offset when the next page is available', () => {
    const onChange = vi.fn()
    renderTable(baseQuery(), 100, onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }))
  })

  it('does not navigate after the last page', () => {
    const onChange = vi.fn()
    renderTable(baseQuery({ offset: 75 }), 100, onChange)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('returns to the first page when the current page indicator is activated', () => {
    const onChange = vi.fn()
    renderTable(baseQuery({ offset: 50 }), 100, onChange)
    fireEvent.click(screen.getByRole('button', { name: '3 / 4' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }))
  })

  it('resets pagination after selecting a supported page size', () => {
    const onChange = vi.fn()
    renderTable(baseQuery({ offset: 50 }), 100, onChange)
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }))
  })

  it('ignores a page size outside the offered choices', () => {
    const onChange = vi.fn()
    renderTable(baseQuery(), 100, onChange)
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '1000' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses a valid display size and nonnegative offset when given a malformed query', () => {
    renderTable(baseQuery({ limit: 0, offset: -5 }), 100, vi.fn())
    expect(screen.getByRole('button', { name: '1 / 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('25')
  })
})
