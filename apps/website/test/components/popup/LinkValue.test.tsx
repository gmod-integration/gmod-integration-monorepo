import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { createSignal } from 'solid-js'
import { LinkValue } from '../../../src/components/popup/LinkValue.js'

afterEach(() => cleanup())

describe('components/popup/LinkValue.tsx', () => {
  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'file:///tmp/example', '//untrusted.example'])(
    'renders unsupported legacy values as copyable text instead of navigation: %s',
    (url) => {
      renderWithProviders(() => <LinkValue url={url} />)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText(url)).toBeInTheDocument()
      expect(screen.getByRole('button')).toBeEnabled()
    },
  )

  it('uses the explicit text prop when provided', () => {
    renderWithProviders(() => <LinkValue url="https://example.com/path" text="Custom label" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com/path')
    expect(link).toHaveTextContent('Custom label')
  })

  it('derives the text from the url when text is not provided (strips protocol and trailing slash)', () => {
    renderWithProviders(() => <LinkValue url="https://example.com/path/" />)
    expect(screen.getByRole('link')).toHaveTextContent('example.com/path')
  })

  it('derives the text from an http url without a trailing slash', () => {
    renderWithProviders(() => <LinkValue url="http://example.com" />)
    expect(screen.getByRole('link')).toHaveTextContent('example.com')
  })

  it('keeps a malformed URL inert when its label has no content after stripping the protocol', () => {
    const { container } = renderWithProviders(() => <LinkValue url="https://" />)
    expect(container.querySelector('a')).toBeNull()
  })

  it('updates the derived label when an edited URL changes', () => {
    const [url, setUrl] = createSignal('https://old.example/')
    renderWithProviders(() => <LinkValue url={url()} />)
    setUrl('https://new.example/rules')
    expect(screen.getByRole('link')).toHaveTextContent('new.example/rules')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://new.example/rules')
  })
})
