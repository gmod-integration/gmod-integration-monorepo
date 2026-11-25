import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import AdminRegistrationsChart from '../../../../src/pages/dashboard/admins/AdminRegistrationsChart.js'
import AdminDistributionChart from '../../../../src/pages/dashboard/admins/AdminDistributionChart.js'
import { analyticsFixture } from './analyticsFixtures.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('accessible administration charts', () => {
  it('plots three distinguishable series and provides every exact UTC day in a table', async () => {
    const { container } = renderWithProviders(() => <AdminRegistrationsChart data={analyticsFixture(7)} metric="all" />)
    expect(screen.getByRole('img', { name: /Daily registration trends in UTC/ })).toBeInTheDocument()
    const lines = [...container.querySelectorAll('[data-registration-series] > path')]
    expect(lines).toHaveLength(3)
    expect(new Set(lines.map((line) => line.getAttribute('stroke-dasharray'))).size).toBe(3)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    await fireEvent.click(screen.getByText('View daily data'))
    const table = screen.getByRole('table', { name: 'Daily registration counts (UTC)' })
    expect(within(table).getAllByRole('row')).toHaveLength(8)
    const first = within(table).getAllByRole('row')[1]
    expect(first).toHaveTextContent('Nov 16, 2026')
    expect(
      within(first)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['3', '0', '0'])
    const last = within(table).getAllByRole('row').at(-1)!
    expect(
      within(last)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['0', '2', '8'])
  })
  it('limits both the plot and accessible table to the selected metric', async () => {
    const { container } = renderWithProviders(() => (
      <AdminRegistrationsChart data={analyticsFixture(7)} metric="accounts" />
    ))
    expect(container.querySelectorAll('[data-registration-series]')).toHaveLength(1)
    expect(container.querySelector('[data-registration-series]')).toHaveAttribute(
      'data-registration-series',
      'accounts',
    )
    await fireEvent.click(screen.getByText('View daily data'))
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((heading) => heading.textContent),
    ).toEqual(['Date', 'User accounts'])
  })
  it('distinguishes an empty registration window from failure while keeping its zero counts available', async () => {
    const { container } = renderWithProviders(() => (
      <AdminRegistrationsChart data={analyticsFixture(7, true)} metric="all" />
    ))
    expect(screen.getByRole('status')).toHaveTextContent('No registrations for the selected metric in this period.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByText('View daily data'))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(8)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
  it('compares overlapping source counts with independent bars instead of parts of a total', async () => {
    const { container } = renderWithProviders(() => (
      <AdminDistributionChart
        label="Recorded Premium sources"
        items={[
          { label: 'Manual grants', value: 15 },
          { label: 'GmodStore', value: 10 },
        ]}
        emptyLabel="No recorded grants"
      />
    ))
    const bars = [...container.querySelectorAll('[data-distribution-bar]')]
    expect(bars.map((bar) => Number(bar.getAttribute('width')))).toEqual([100, (10 / 15) * 100])
    expect(screen.getByRole('img', { name: 'Manual grants: 15' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'GmodStore: 10' })).toBeInTheDocument()
    await fireEvent.click(screen.getByText('View chart data'))
    expect(screen.getByRole('table', { name: 'Recorded Premium sources' })).toHaveTextContent('GmodStore10')
  })
})
