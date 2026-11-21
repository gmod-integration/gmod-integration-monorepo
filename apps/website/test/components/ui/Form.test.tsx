import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { renderWithProviders } from '../../testUtils.js'
import { FormActions, FormField } from '../../../src/components/ui/index.js'

beforeEach(() => window.localStorage.clear())
afterEach(() => cleanup())

describe('shared form components', () => {
  it('labels a native control and exposes hint and validation ids', () => {
    renderWithProviders(() => (
      <FormField
        id="destination"
        label="Destination"
        description="Use an HTTPS address."
        error="Enter a valid URL."
        required
      >
        <input
          id="destination"
          required
          aria-invalid="true"
          aria-describedby="destination-description destination-error"
        />
      </FormField>
    ))
    const input = screen.getByRole('textbox', { name: 'Destination' })
    expect(input).toBeRequired()
    expect(input).toHaveAccessibleDescription('Use an HTTPS address. Enter a valid URL.')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid URL.')
  })

  it('blocks both actions during a pending request and lets cancel recover from an unavailable save', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    const [pending, setPending] = createSignal(false)
    const [disabled, setDisabled] = createSignal(true)
    renderWithProviders(() => (
      <FormActions pending={pending()} disabled={disabled()} onSave={onSave} onCancel={onCancel} />
    ))
    const save = screen.getByRole('button', { name: 'Save' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(save).toBeDisabled()
    expect(cancel).not.toBeDisabled()
    await fireEvent.click(save)
    await fireEvent.click(cancel)
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    setDisabled(false)
    setPending(true)
    await fireEvent.click(save)
    await fireEvent.click(cancel)
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    setPending(false)
    await fireEvent.click(save)
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('disables clean drafts and announces errors and saved state consistently', () => {
    const [dirty, setDirty] = createSignal(false)
    const [error, setError] = createSignal<string | boolean>(false)
    const [success, setSuccess] = createSignal<string | boolean>(false)
    renderWithProviders(() => <FormActions dirty={dirty()} error={error()} success={success()} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    setDirty(true)
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    setError('The server refused this value.')
    expect(screen.getByRole('alert')).toHaveTextContent('The server refused this value.')
    setError(false)
    setDirty(false)
    setSuccess('Settings saved.')
    expect(screen.getByRole('status')).toHaveTextContent('Settings saved.')
    setDirty(true)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
