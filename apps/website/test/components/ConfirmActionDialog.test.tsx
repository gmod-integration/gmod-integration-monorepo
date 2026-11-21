import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { A } from '@solidjs/router'
import ConfirmActionDialog from '../../src/components/ConfirmActionDialog.js'
import { DraftEditingProvider } from '../../src/components/DraftEditingProvider.js'
import { renderWithProviders } from '../testUtils.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('confirmation dialog interactions', () => {
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
