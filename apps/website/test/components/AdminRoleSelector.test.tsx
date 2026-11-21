import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import AdminRoleSelector from '../../src/components/AdminRoleSelector.js'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
const roles = [
  { id: 'admin', name: 'Admin' },
  { id: 'member', name: 'Member' },
]
function renderSelector(onConfirm: (roleID: string) => Promise<unknown>) {
  const { container } = renderWithProviders(() => (
    <AdminRoleSelector id="role-picker" title="Select role" roles={roles} onConfirm={onConfirm} />
  ))
  const modal = container.querySelector<HTMLDialogElement>('#role-picker')!
  modal.showModal()
  return modal
}

describe('AdminRoleSelector', () => {
  it('keeps choosing local until Save and resets the selection after canceling', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined)
    const modal = renderSelector(confirm)
    const select = within(modal).getByRole('combobox')
    expect(within(modal).getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.change(select, { target: { value: 'admin' } })
    expect(confirm).not.toHaveBeenCalled()
    await fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }))
    expect(modal.open).toBe(false)
    modal.showModal()
    expect(select).toHaveValue('')
    expect(confirm).not.toHaveBeenCalled()
    await fireEvent.change(select, { target: { value: 'member' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save' }))
    expect(confirm).toHaveBeenCalledExactlyOnceWith('member')
    await vi.waitFor(() => expect(modal.open).toBe(false))
  })

  it('preserves the chosen role and exposes retryable errors without closing', async () => {
    const confirm = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(undefined)
    const modal = renderSelector(confirm)
    const select = within(modal).getByRole('combobox')
    await fireEvent.change(select, { target: { value: 'admin' } })
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument())
    expect(modal.open).toBe(true)
    expect(select).toHaveValue('admin')
    await fireEvent.click(within(modal).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(modal.open).toBe(false))
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('blocks duplicate saves, editing and dismissal during the request', async () => {
    let finish!: () => void
    const confirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const modal = renderSelector(confirm)
    const select = within(modal).getByRole('combobox')
    await fireEvent.change(select, { target: { value: 'admin' } })
    const save = within(modal).getByRole('button', { name: 'Save' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect(confirm).toHaveBeenCalledOnce()
    expect(select).toBeDisabled()
    expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(modal).getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(modal.dispatchEvent(new Event('cancel', { cancelable: true }))).toBe(false)
    expect(modal.open).toBe(true)
    finish()
    await vi.waitFor(() => expect(modal.open).toBe(false))
  })
})
