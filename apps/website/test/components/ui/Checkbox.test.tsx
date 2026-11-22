import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { Checkbox } from '../../../src/components/ui/Checkbox.js'
import { renderWithProviders } from '../../testUtils.js'

afterEach(cleanup)

describe('Checkbox', () => {
  it('keeps native input attributes, field naming and description associations', () => {
    let input: HTMLInputElement | undefined
    const { container } = renderWithProviders(() => (
      <form>
        <label for="show-players">Show players</label>
        <p id="players-help">Include connected players.</p>
        <Checkbox
          id="show-players"
          name="players"
          value="enabled"
          checked
          aria-describedby="players-help"
          ref={(element) => {
            input = element
          }}
        />
      </form>
    ))
    const checkbox = screen.getByRole('checkbox', { name: 'Show players' })
    expect(checkbox).toBe(input)
    expect(checkbox).toHaveAccessibleDescription('Include connected players.')
    expect(checkbox).toBeChecked()
    expect(new FormData(container.querySelector('form')!).get('players')).toBe('enabled')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('updates a controlled draft through the native input and its associated label', () => {
    const [checked, setChecked] = createSignal(false)
    renderWithProviders(() => (
      <>
        <label for="chart">Show chart</label>
        <Checkbox id="chart" checked={checked()} onChange={(event) => setChecked(event.currentTarget.checked)} />
      </>
    ))
    const checkbox = screen.getByRole('checkbox', { name: 'Show chart' })
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    fireEvent.click(screen.getByText('Show chart'))
    expect(checkbox).not.toBeChecked()
  })

  it('honors disabled state and retains a checked value during a pending action', () => {
    const onChange = vi.fn()
    renderWithProviders(() => <Checkbox aria-label="Pending option" checked disabled onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Pending option' }) as HTMLInputElement
    expect(checkbox).toBeDisabled()
    checkbox.click()
    expect(checkbox).toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })
})
