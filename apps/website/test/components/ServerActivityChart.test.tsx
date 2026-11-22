import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { renderWithProviders } from '../testUtils.js'
import ServerActivityChart from '../../src/components/ServerActivityChart.js'

afterEach(cleanup)

describe('ServerActivityChart', () => {
  it('keeps historical activity visible for offline servers and orders samples by time', () => {
    const { container } = renderWithProviders(() => (
      <ServerActivityChart
        online={false}
        points={[
          { at: '2026-11-20T00:00:00.000Z', players: 4 },
          { at: '2026-11-18T00:00:00.000Z', players: 12 },
          { at: '2026-11-19T00:00:00.000Z', players: 8 },
        ]}
      />
    ))
    expect(screen.getByRole('img', { name: /Peak: 12/ })).toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    const values = [...container.querySelectorAll('circle title')].map((title) => title.textContent)
    expect(values[0]).toContain('12 Players')
    expect(values[2]).toContain('4 Players')
    expect(container.querySelector('svg')).toHaveClass('text-base-content/60')
  })

  it('does not fabricate population or connect across gaps in the history', () => {
    const { container } = renderWithProviders(() => (
      <ServerActivityChart
        online={true}
        points={[
          { at: '2026-11-15T00:00:00.000Z', players: 2 },
          { at: '2026-11-16T00:00:00.000Z', players: 4 },
          { at: '2026-11-20T00:00:00.000Z', players: 8 },
        ]}
      />
    ))
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    const path = container.querySelector('[data-activity-line]')!.getAttribute('d')!
    expect(path.match(/M/g)).toHaveLength(2)
    expect(path.match(/L/g)).toHaveLength(1)
    expect(container.querySelector('svg')).toHaveClass('text-primary')
  })

  it('distinguishes an empty history from a valid zero-player snapshot and updates reactively', async () => {
    const [points, setPoints] = createSignal<{ at: string; players: number }[]>([])
    const { container } = renderWithProviders(() => <ServerActivityChart online={true} points={points()} />)
    expect(screen.getByText('No activity data is available for this period.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    setPoints([{ at: '2026-11-20T00:00:00.000Z', players: 0 }])
    await Promise.resolve()
    expect(screen.getByRole('img', { name: /Peak: 0/ })).toBeInTheDocument()
    expect(container.querySelector('circle')).toHaveAttribute('cx', '150')
    expect(container.querySelector('[data-activity-line]')!.getAttribute('d')).not.toMatch(/NaN|Infinity/)
  })

  it('collapses duplicate timestamps to their peak and ignores unusable samples', () => {
    const { container } = renderWithProviders(() => (
      <ServerActivityChart
        online={true}
        points={[
          { at: 'invalid', players: 8 },
          { at: '2026-11-20T00:00:00.000Z', players: 3 },
          { at: '2026-11-20T00:00:00.000Z', players: 9 },
          { at: '2026-11-19T00:00:00.000Z', players: -1 },
          { at: '2026-11-18T00:00:00.000Z', players: Number.NaN },
        ]}
      />
    ))
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(screen.getByRole('img', { name: /Peak: 9/ })).toBeInTheDocument()
  })
})
