import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { Button, ButtonLink, IconButton, IconButtonLink } from '../../../src/components/ui/index.js'

afterEach(() => cleanup())

describe('shared buttons', () => {
  it('keeps icon downloads as named native links and forwards their download and window attributes', () => {
    render(() => (
      <IconButtonLink
        icon="download"
        label="Download event data"
        href="/event.json"
        download="event.json"
        target="_blank"
        rel="noopener noreferrer"
      />
    ))
    const link = screen.getByRole('link', { name: 'Download event data' })
    expect(link).toHaveAttribute('href', '/event.json')
    expect(link).toHaveAttribute('download', 'event.json')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('keeps navigation as a native link when using the shared action appearance', () => {
    render(() => (
      <ButtonLink href="/docs" variant="primary">
        Documentation
      </ButtonLink>
    ))
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/docs')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('defaults to a non-submitting button and forwards native attributes and click events', async () => {
    const onClick = vi.fn()
    render(() => (
      <Button name="save-settings" onClick={onClick}>
        Save settings
      </Button>
    ))
    const button = screen.getByRole('button', { name: 'Save settings' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('name', 'save-settings')
    await fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('supports Solid bound event handlers and explicit submit semantics', async () => {
    const onClick = vi.fn()
    render(() => (
      <Button type="submit" onClick={[onClick, 'draft']}>
        Save
      </Button>
    ))
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'submit')
    await fireEvent.click(button)
    expect(onClick).toHaveBeenCalledWith('draft', expect.any(MouseEvent))
  })

  it('preserves reactive native classList when a page conditionally hides an action', () => {
    const [hidden, setHidden] = createSignal(true)
    const { container } = render(() => <Button classList={{ hidden: hidden() }}>Configure</Button>)
    const button = container.querySelector('button')!
    expect(button).toHaveClass('hidden')
    setHidden(false)
    expect(button).not.toHaveClass('hidden')
    expect(button).toHaveTextContent('Configure')
  })

  it('keeps the label and suppresses repeated clicks while pending or disabled', async () => {
    const onClick = vi.fn()
    const [pending, setPending] = createSignal(true)
    const [disabled, setDisabled] = createSignal(false)
    render(() => (
      <Button loading={pending()} disabled={disabled()} onClick={onClick}>
        Save
      </Button>
    ))
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    setPending(false)
    setDisabled(true)
    await fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    setDisabled(false)
    await fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('gives icon actions an accessible name and preserves keyboard focusability', () => {
    const { container } = render(() => <IconButton label="Delete link" icon="trash-2" />)
    const button = screen.getByRole('button', { name: 'Delete link' })
    expect(button).toHaveAttribute('title', 'Delete link')
    expect(container.querySelector('svg[data-icon="trash-2"]')).toHaveAttribute('aria-hidden', 'true')
    button.focus()
    expect(button).toHaveFocus()
  })
})
