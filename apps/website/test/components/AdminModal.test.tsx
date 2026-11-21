import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { renderWithProviders } from '../testUtils.js'
import AdminModal from '../../src/components/AdminModal.js'

afterEach(() => cleanup())
beforeEach(() => window.localStorage.clear())

describe('components/AdminModal.tsx', () => {
  it('renders the title, id, close button, and children inside a dialog', () => {
    const { container } = renderWithProviders(() => (
      <AdminModal title="My Modal" id="my_modal">
        <div data-testid="child">modal body</div>
      </AdminModal>
    ))
    const dialog = container.querySelector('dialog#my_modal')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('My Modal')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toHaveTextContent('modal body')
    expect(container.querySelector('form[method="dialog"] button')).toBeInTheDocument()
    const close = container.querySelector('form[method="dialog"] button')!
    expect(close).toHaveAccessibleName('Close')
    ;(dialog as HTMLDialogElement).showModal()
    expect(dialog).toHaveAccessibleName('My Modal')
  })

  it('associates optional guidance and renders the shared footer slot', () => {
    const { container } = renderWithProviders(() => (
      <AdminModal
        id="editor"
        title="Editor"
        description="Check your changes before saving."
        footer={<button>Save</button>}
      >
        <input aria-label="Name" />
      </AdminModal>
    ))
    const dialog = container.querySelector('dialog')!
    expect(dialog).toHaveAccessibleDescription('Check your changes before saving.')
    expect(container.querySelector('button[aria-label="Close"]')).toBeInTheDocument()
    expect(container.querySelector('input')).toBeInTheDocument()
    expect(container.querySelectorAll('button')).toHaveLength(2)
  })

  it('blocks user dismissal while saving and preserves cancel/close callbacks', async () => {
    const onCancel = vi.fn()
    const onClose = vi.fn()
    const [busy, setBusy] = createSignal(true)
    const { container } = renderWithProviders(() => (
      <AdminModal id="editor" title="Editor" busy={busy()} onCancel={onCancel} onClose={onClose}>
        <span>Draft</span>
      </AdminModal>
    ))
    const dialog = container.querySelector('dialog')!
    const close = container.querySelector('button')!
    expect(close).toBeDisabled()
    const blockedCancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(blockedCancel)
    expect(blockedCancel.defaultPrevented).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
    const submit = new Event('submit', { bubbles: true, cancelable: true })
    container.querySelector('form')!.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)

    setBusy(false)
    expect(close).not.toBeDisabled()
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(false)
    expect(onCancel).toHaveBeenCalledOnce()
    await fireEvent(dialog, new Event('close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
