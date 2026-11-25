import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { A } from '@solidjs/router'
import { createSignal } from 'solid-js'
import ConfirmActionDialog from '../../src/components/ConfirmActionDialog.js'
import { DraftEditingProvider } from '../../src/components/DraftEditingProvider.js'
import { renderWithProviders } from '../testUtils.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('confirmation dialog interactions', () => {
  it('clears a rejected command on native Escape without sending another request', async () => {
    const confirm = vi.fn().mockRejectedValue(new Error('Offline'))
    const { container } = renderWithProviders(() => (
      <ConfirmActionDialog id="escape-command" title="Remove rule" onConfirm={confirm} />
    ))
    const dialog = container.querySelector<HTMLDialogElement>('#escape-command')!
    dialog.showModal()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await within(dialog).findByRole('alert')
    const cancellation = new Event('cancel', { cancelable: true })
    await fireEvent(dialog, cancellation)
    expect(cancellation.defaultPrevented).toBe(false)
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('validates extra confirmation fields and locks them while the command is pending', async () => {
    const [reason, setReason] = createSignal('')
    let finish!: () => void
    const confirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { container } = renderWithProviders(() => (
      <ConfirmActionDialog id="review" title="Review change" disabled={reason().trim().length < 5} onConfirm={confirm}>
        {(pending) => (
          <label>
            Reason
            <input value={reason()} disabled={pending()} onInput={(event) => setReason(event.currentTarget.value)} />
          </label>
        )}
      </ConfirmActionDialog>
    ))
    const dialog = container.querySelector<HTMLDialogElement>('#review')!
    dialog.showModal()
    const button = within(dialog).getByRole('button', { name: 'Confirm' })
    const field = within(dialog).getByRole('textbox', { name: 'Reason' })
    expect(button).toBeDisabled()
    await fireEvent.input(field, { target: { value: 'Support review' } })
    await fireEvent.click(button)
    expect(field).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await fireEvent.click(button)
    expect(confirm).toHaveBeenCalledOnce()
    finish()
    await vi.waitFor(() => expect(dialog.open).toBe(false))
  })
  it('cancels a rejected command without retrying and clears the old error when reopened', async () => {
    const confirm = vi.fn().mockRejectedValue(new Error('Offline'))
    const { container } = renderWithProviders(() => (
      <ConfirmActionDialog id="remove" title="Remove saved rule" onConfirm={confirm} />
    ))
    const dialog = container.querySelector<HTMLDialogElement>('#remove')!
    dialog.showModal()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(dialog.open).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
    dialog.showModal()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeEnabled()
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('blocks navigation during a command and permits leaving only after it settles', async () => {
    let finish!: () => void
    const confirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { container } = renderWithProviders(
      () => (
        <DraftEditingProvider>
          <ConfirmActionDialog id="remove" title="Remove saved rule" onConfirm={confirm} />
          <A href="/other">Leave confirmation</A>
        </DraftEditingProvider>
      ),
      { path: '*' },
    )
    const dialog = container.querySelector<HTMLDialogElement>('#remove')!
    dialog.showModal()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await fireEvent.click(screen.getByRole('link', { name: 'Leave confirmation' }))
    const guard = container.querySelector<HTMLDialogElement>('#discard-dashboard-changes')!
    expect(guard.open).toBe(true)
    expect(within(guard).getByRole('button', { name: 'Discard and leave' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish()
    await vi.waitFor(() => expect(within(guard).getByRole('button', { name: 'Discard and leave' })).toBeEnabled())
    await fireEvent.click(within(guard).getByRole('button', { name: 'Discard and leave' }))
    expect(guard.open).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })
})
