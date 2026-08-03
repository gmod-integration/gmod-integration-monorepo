import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { TextValue } from '../../../src/components/popup/TextValue.js'

afterEach(() => cleanup())

describe('components/popup/TextValue.tsx', () => {
  it('renders the value text', () => {
    render(() => <TextValue value="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders empty when value is an empty string', () => {
    const { container } = render(() => <TextValue value="" />)
    expect(container.querySelector('p')).toBeEmptyDOMElement()
  })
})
