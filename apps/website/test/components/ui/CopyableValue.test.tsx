import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal, type JSX } from 'solid-js'
import { CopyableValue } from '../../../src/components/ui/CopyableValue.js'
import { I18nProvider } from '../../../src/i18n.js'

const writeText = vi.fn<(value: string) => Promise<void>>()
const renderValue = (ui: () => JSX.Element) => render(() => <I18nProvider>{ui()}</I18nProvider>)

beforeEach(() => {
  localStorage.clear()
  writeText.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('shared clipboard controls', () => {
  it('copies the complete value and shows confirmation only after the write resolves', async () => {
    let confirm!: () => void
    writeText.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve
        }),
    )
    const command = 'gmod-integration config set id "server-id"\ngmod-integration config try'
    const { container } = renderValue(() => <CopyableValue value={command} multiline label="Copy setup commands" />)
    const button = screen.getByRole('button', { name: 'Copy setup commands' })
    expect(container.querySelector('.ui-copyable')).toBeInTheDocument()
    expect(container.querySelector('svg[data-icon="copy"]')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith(command)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-copy-state', 'pending')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(button)
    expect(writeText).toHaveBeenCalledOnce()
    confirm()
    await vi.waitFor(() => expect(button).toHaveAttribute('data-copy-state', 'copied'))
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('title', 'Copied!')
    expect(container.querySelector('svg[data-icon="check"]')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copied!')
  })

  it('shows a clipboard failure without claiming success and permits retry', async () => {
    writeText.mockRejectedValueOnce(new Error('Permission denied'))
    const { container } = renderValue(() => <CopyableValue value="copy me" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await fireEvent.click(button)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to copy. Please try again.'))
    expect(container.querySelector('svg[data-icon="circle-alert"]')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(button).toBeEnabled()
    await fireEvent.click(button)
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied!'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('explains an unavailable clipboard rather than reporting a false success', async () => {
    vi.stubGlobal('navigator', {})
    renderValue(() => <CopyableValue value="copy me" />)
    await fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('copies a masked secret without exposing it in text or button labels', async () => {
    const secret = 'a-very-secret-token'
    const { container } = renderValue(() => <CopyableValue value={secret} display="••••••••" label="Copy token" />)
    expect(container.innerHTML).not.toContain(secret)
    expect(screen.getByText('••••••••')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Copy token' }))
    await vi.waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(writeText).toHaveBeenCalledWith(secret)
    expect(container.innerHTML).not.toContain(secret)
  })

  it('resets confirmation after a short delay and when the copied value changes', async () => {
    vi.useFakeTimers()
    const [value, setValue] = createSignal('old')
    renderValue(() => <CopyableValue value={value()} />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await fireEvent.click(button)
    await vi.advanceTimersByTimeAsync(0)
    expect(button).toHaveAttribute('data-copy-state', 'copied')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(button).toHaveAttribute('data-copy-state', 'idle')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(button)
    await vi.advanceTimersByTimeAsync(0)
    setValue('new')
    expect(button).toHaveAttribute('data-copy-state', 'idle')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(button)
    expect(writeText).toHaveBeenLastCalledWith('new')
  })

  it('does not show stale confirmation if the value changes while copying', async () => {
    let confirm!: () => void
    writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve
        }),
    )
    const [value, setValue] = createSignal('old')
    renderValue(() => <CopyableValue value={value()} />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await fireEvent.click(button)
    setValue('new')
    confirm()
    await vi.waitFor(() => expect(button).toBeEnabled())
    expect(button).toHaveAttribute('data-copy-state', 'idle')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not write an empty or disabled value', async () => {
    renderValue(() => <CopyableValue value="" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button).toBeDisabled()
    await fireEvent.click(button)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('cleans up confirmation timers when unmounted', async () => {
    vi.useFakeTimers()
    const { unmount } = renderValue(() => <CopyableValue value="copy me" />)
    await fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
