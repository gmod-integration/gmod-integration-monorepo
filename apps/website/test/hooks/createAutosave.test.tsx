import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { createAutosave } from '../../src/hooks/createAutosave.js'
import { createDraftForm } from '../../src/hooks/createDraftForm.js'
import { AutosaveFeedback } from '../../src/components/ui/AutosaveFeedback.js'
import { renderWithProviders } from '../testUtils.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderEditor(persist: (value: { name: string }) => Promise<{ name: string } | void>) {
  const [enabled, setEnabled] = createSignal(true)
  const result = renderWithProviders(() => {
    const form = createDraftForm({
      initial: { name: 'Saved' },
      allowPendingEdits: true,
      validate: (value) => (value.name.trim() ? {} : { name: 'Required' }),
      errorMessage: () => 'Unable to save.',
    })
    const autosave = createAutosave({ form, save: () => form.save(persist), enabled })
    return (
      <>
        <input
          aria-label="Name"
          value={form.draft().name}
          onInput={(event) => form.patch({ name: event.currentTarget.value })}
        />
        <AutosaveFeedback state={autosave} />
      </>
    )
  })
  return { ...result, setEnabled, input: screen.getByRole('textbox', { name: 'Name' }) }
}

describe('automatic settings persistence', () => {
  it('does not write hydration and combines rapid typing into one validated save', async () => {
    const persist = vi.fn().mockResolvedValue({ name: 'Canonical' })
    const { input } = renderEditor(persist)
    await vi.advanceTimersByTimeAsync(500)
    expect(persist).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.input(input, { target: { value: 'First' } })
    await vi.advanceTimersByTimeAsync(250)
    await fireEvent.input(input, { target: { value: 'Final' } })
    await vi.advanceTimersByTimeAsync(399)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(persist).toHaveBeenCalledExactlyOnceWith({ name: 'Final' })
    expect(input).toHaveValue('Canonical')
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('preserves new edits made during a request and saves them after it settles', async () => {
    let finish!: () => void
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)
    const { input } = renderEditor(persist)
    await fireEvent.input(input, { target: { value: 'First' } })
    await vi.advanceTimersByTimeAsync(400)
    await fireEvent.input(input, { target: { value: 'Latest' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(input).toBeEnabled()
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(input).toHaveValue('Latest')
    await vi.advanceTimersByTimeAsync(400)
    expect(persist.mock.calls).toEqual([[{ name: 'First' }], [{ name: 'Latest' }]])
    expect(input).toHaveValue('Latest')
  })

  it('rebases nested in-flight edits onto server-normalized fields and generated metadata', async () => {
    type Settings = {
      title: string
      profile: { supportUrl: string; language: string; id?: string; legacyLabel?: string }
      adminRanks: string[]
    }
    let form!: ReturnType<typeof createDraftForm<Settings>>
    let finish!: (value: Settings) => void
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Settings>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)
    renderWithProviders(() => {
      form = createDraftForm<Settings>({
        initial: {
          title: 'Stored',
          profile: { supportUrl: 'https://saved.example', language: 'en', legacyLabel: 'Old label' },
          adminRanks: ['mod'],
        },
        allowPendingEdits: true,
      })
      createAutosave({ form, save: () => form.save(persist) })
      return <output>{JSON.stringify(form.draft())}</output>
    })
    form.patch({
      title: ' Trimmed title ',
      profile: { supportUrl: ' https://support.example/ ', language: 'en', legacyLabel: 'Old label' },
      adminRanks: ['mod', 'mod'],
    })
    await vi.advanceTimersByTimeAsync(400)
    form.setDraft((previous) => ({
      ...previous,
      profile: { supportUrl: previous.profile.supportUrl, language: 'fr' },
    }))
    const accepted: Settings = {
      title: 'Trimmed title',
      profile: {
        supportUrl: 'https://support.example/',
        language: 'en',
        id: 'canonical-id',
        legacyLabel: 'Server label',
      },
      adminRanks: ['mod'],
    }
    finish(accepted)
    await vi.advanceTimersByTimeAsync(0)
    const expected = {
      title: 'Trimmed title',
      profile: { supportUrl: 'https://support.example/', language: 'fr', id: 'canonical-id' },
      adminRanks: ['mod'],
    }
    expect(form.saved()).toEqual(accepted)
    expect(form.draft()).toEqual(expected)
    await vi.advanceTimersByTimeAsync(400)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenLastCalledWith(expected)
    expect(form.dirty()).toBe(false)
  })

  it('keeps a list replaced during a request together while adopting unrelated normalized fields', async () => {
    type Settings = { name: string; roles: string[] }
    let form!: ReturnType<typeof createDraftForm<Settings>>
    let finish!: (value: Settings) => void
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Settings>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)
    renderWithProviders(() => {
      form = createDraftForm({ initial: { name: 'Stored', roles: ['member'] }, allowPendingEdits: true })
      createAutosave({ form, save: () => form.save(persist) })
      return <output>{JSON.stringify(form.draft())}</output>
    })
    form.patch({ name: ' Updated ', roles: ['member', 'member'] })
    await vi.advanceTimersByTimeAsync(400)
    form.patch({ roles: ['vip'] })
    finish({ name: 'Updated', roles: ['canonical-member'] })
    await vi.advanceTimersByTimeAsync(0)
    expect(form.draft()).toEqual({ name: 'Updated', roles: ['vip'] })
    await vi.advanceTimersByTimeAsync(400)
    expect(persist).toHaveBeenLastCalledWith({ name: 'Updated', roles: ['vip'] })
    expect(form.dirty()).toBe(false)
  })

  it('keeps a failed value without retrying in a loop and allows an explicit retry', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined)
    const { input } = renderEditor(persist)
    await fireEvent.input(input, { target: { value: 'Draft' } })
    await vi.advanceTimersByTimeAsync(400)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save.')
    expect(input).toHaveValue('Draft')
    await vi.advanceTimersByTimeAsync(2000)
    expect(persist).toHaveBeenCalledTimes(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('waits for valid values and restored access, then saves the preserved change', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { input, setEnabled } = renderEditor(persist)
    await fireEvent.input(input, { target: { value: '' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(persist).not.toHaveBeenCalled()
    setEnabled(false)
    await fireEvent.input(input, { target: { value: 'Allowed later' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(persist).not.toHaveBeenCalled()
    setEnabled(true)
    await vi.advanceTimersByTimeAsync(400)
    expect(persist).toHaveBeenCalledExactlyOnceWith({ name: 'Allowed later' })
  })

  it('cancels a scheduled write when its editor is unmounted', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { input, unmount } = renderEditor(persist)
    await fireEvent.input(input, { target: { value: 'Draft' } })
    unmount()
    await vi.advanceTimersByTimeAsync(1000)
    expect(persist).not.toHaveBeenCalled()
  })
})
