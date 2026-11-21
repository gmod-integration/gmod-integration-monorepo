import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library'
import { A, MemoryRouter, Route, useNavigate } from '@solidjs/router'
import { createEffect, createSignal } from 'solid-js'
import { I18nProvider } from '../../src/i18n.js'
import { createDraftForm } from '../../src/hooks/createDraftForm.js'
import { DraftEditingProvider } from '../../src/components/DraftEditingProvider.js'
import ConfirmActionDialog from '../../src/components/ConfirmActionDialog.js'
import { FormActions } from '../../src/components/ui/FormActions.js'
import { renderWithProviders } from '../testUtils.js'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function Editor(props: { persist: (snapshot: { name: string }) => Promise<{ name: string } | void> }) {
  const [source] = createSignal({ name: 'Saved' })
  const form = createDraftForm({
    initial: source(),
    validate: (value) => (value.name.trim() ? {} : { name: 'Required' }),
  })
  // A request changing pending must not resubscribe this hydration effect.
  createEffect(() => form.reset(source()))
  return (
    <>
      <input
        aria-label="Name"
        value={form.draft().name}
        disabled={form.pending()}
        onInput={(event) => form.patch({ name: event.currentTarget.value })}
      />
      <FormActions
        dirty={form.dirty()}
        disabled={!form.valid()}
        pending={form.pending()}
        error={form.error()}
        success={form.success()}
        onSave={() => void form.save(props.persist)}
        onCancel={form.discard}
      />
    </>
  )
}

describe('shared draft lifecycle', () => {
  it('validates, cancels locally, retains rejected edits and accepts canonical saved values', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ name: 'Canonical' })
    renderWithProviders(() => <Editor persist={persist} />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await fireEvent.input(input, { target: { value: '' } })
    expect(save).toBeDisabled()
    await fireEvent.input(input, { target: { value: 'Draft' } })
    expect(persist).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(input).toHaveValue('Saved')
    await fireEvent.input(input, { target: { value: 'Draft' } })
    await fireEvent.click(save)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(input).toHaveValue('Draft')
    await fireEvent.click(save)
    await vi.waitFor(() => expect(input).toHaveValue('Canonical'))
    expect(save).toBeDisabled()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenLastCalledWith({ name: 'Draft' })
  })

  it('allows one pending save and keeps the committed snapshot after hydration', async () => {
    let finish!: () => void
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderWithProviders(() => <Editor persist={persist} />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    await fireEvent.input(input, { target: { value: 'New saved' } })
    const save = screen.getByRole('button', { name: 'Save' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect(persist).toHaveBeenCalledOnce()
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish()
    await vi.waitFor(() => expect(input).toBeEnabled())
    expect(save).toBeDisabled()
    expect(input).toHaveValue('New saved')
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })
})

describe('draft navigation protection', () => {
  function renderEditor(persist = vi.fn().mockResolvedValue(undefined)) {
    render(() => (
      <MemoryRouter
        root={(props) => (
          <I18nProvider>
            <DraftEditingProvider>{props.children}</DraftEditingProvider>
          </I18nProvider>
        )}
      >
        <Route
          path="/"
          component={() => {
            const navigate = useNavigate()
            return (
              <>
                <Editor persist={persist} />
                <A href="/next">Next</A>
                <button onClick={() => navigate('?view=details')}>Details</button>
              </>
            )
          }}
        />
        <Route path="/next" component={() => <p>Destination</p>} />
      </MemoryRouter>
    ))
  }
  it('keeps navigation on the page until the user explicitly discards, while allowing local filters', async () => {
    renderEditor()
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Draft' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(document.querySelector('dialog')?.open).toBe(false)
    await fireEvent.click(screen.getByRole('link', { name: 'Next' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.queryByText('Destination')).not.toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Stay on this page' }))
    expect(screen.getByRole('textbox')).toHaveValue('Draft')
    await fireEvent.click(screen.getByRole('link', { name: 'Next' }))
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Discard and leave' }))
    await vi.waitFor(() => expect(screen.getByText('Destination')).toBeInTheDocument())
  })
  it('protects reload and blocks leaving until a pending request settles', async () => {
    let finish!: () => void
    renderEditor(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    )
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Draft' } })
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await fireEvent.click(screen.getByRole('link', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'Discard and leave' })).toBeDisabled()
    finish()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Discard and leave' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })
})

it('confirmation does not execute on open, retains failures and blocks duplicate commands', async () => {
  let finish!: () => void
  const command = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
  renderWithProviders(() => <ConfirmActionDialog id="confirm" title="Delete target" onConfirm={command} />)
  const dialog = document.querySelector<HTMLDialogElement>('#confirm')!
  dialog.showModal()
  expect(command).not.toHaveBeenCalled()
  const confirm = within(dialog).getByRole('button', { name: 'Confirm' })
  await fireEvent.click(confirm)
  await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument())
  expect(dialog.open).toBe(true)
  await fireEvent.click(confirm)
  await fireEvent.click(confirm)
  expect(command).toHaveBeenCalledTimes(2)
  expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
  finish()
  await vi.waitFor(() => expect(dialog.open).toBe(false))
})
