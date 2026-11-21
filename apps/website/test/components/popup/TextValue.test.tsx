import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { TextValue } from '../../../src/components/popup/TextValue.js'
import { renderWithProviders } from '../../testUtils.js'

afterEach(() => cleanup())

describe('components/popup/TextValue.tsx', () => {
  it('renders the value text', () => {
    renderWithProviders(() => <TextValue value="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders empty when value is an empty string', () => {
    const { container } = renderWithProviders(() => <TextValue value="" />)
    expect(container.querySelector('code')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
  })
})
