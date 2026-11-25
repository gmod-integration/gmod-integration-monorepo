import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { renderWithProviders } from '../../testUtils.js'
import { AsyncState, TableState } from '../../../src/components/ui/index.js'

beforeEach(() => window.localStorage.clear())
afterEach(() => cleanup())

describe('shared asynchronous states', () => {
  it('prioritizes loading, then error and empty, and renders content only when ready', async () => {
    const [loading, setLoading] = createSignal(true)
    const [error, setError] = createSignal<unknown>(new Error('Internal details'))
    const [empty, setEmpty] = createSignal(true)
    const retry = vi.fn()
    renderWithProviders(() => (
      <AsyncState loading={loading()} error={error()} empty={empty()} onRetry={retry}>
        <span>Loaded data</span>
      </AsyncState>
    ))
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    setLoading(false)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this content.')
    expect(screen.queryByText('Internal details')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
    setError(undefined)
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to display yet.')
    setEmpty(false)
    expect(screen.getByText('Loaded data')).toBeInTheDocument()
  })

  it('does not evaluate resource content while an error is displayed', () => {
    const Content = () => {
      throw new Error('An errored resource must not be read')
    }
    renderWithProviders(() => (
      <AsyncState error errorLabel="Unable to load the links.">
        <Content />
      </AsyncState>
    ))
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the links.')
  })

  it('keeps table loading and empty states inside a row and restores data rows', () => {
    const [loading, setLoading] = createSignal(true)
    const [empty, setEmpty] = createSignal(false)
    const { container } = renderWithProviders(() => (
      <table>
        <tbody>
          <TableState colSpan={4} loading={loading()} empty={empty()} emptyLabel="No bans found.">
            <tr>
              <td>Player</td>
            </tr>
          </TableState>
        </tbody>
      </table>
    ))
    expect(container.querySelector('tbody > tr > td[colspan="4"]')).toBeInTheDocument()
    expect(container.querySelector('tbody > div')).not.toBeInTheDocument()
    setLoading(false)
    expect(screen.getByRole('cell', { name: 'Player' })).toBeInTheDocument()
    setEmpty(true)
    expect(screen.getByRole('status')).toHaveTextContent('No bans found.')
    expect(screen.queryByRole('cell', { name: 'Player' })).not.toBeInTheDocument()
  })
})
