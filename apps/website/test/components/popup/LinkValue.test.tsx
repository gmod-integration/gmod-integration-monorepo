import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { LinkValue } from '../../../src/components/popup/LinkValue.js'

afterEach(() => cleanup())

describe('components/popup/LinkValue.tsx', () => {
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

  it('renders an empty link when the url has no content left after stripping the protocol', () => {
    const { container } = renderWithProviders(() => <LinkValue url="https://" />)
    expect(container.querySelector('a')).toBeEmptyDOMElement()
  })
})
