import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import JsonViewer from '../../src/components/JsonViewer.js'

afterEach(() => cleanup())

describe('components/JsonViewer.tsx', () => {
  it('renders the highlighted JSON representation of the data', () => {
    const { container } = render(() => <JsonViewer data={{ hello: 'world', n: 1 }} />)
    const code = container.querySelector('pre.hljs code')
    expect(code).toBeInTheDocument()
    expect(code?.innerHTML).toContain('hello')
    expect(code?.innerHTML).toContain('world')
  })

  it('re-highlights when data changes', () => {
    const { container } = render(() => <JsonViewer data={{ a: 1 }} />)
    expect(container.querySelector('code')?.textContent).toContain('"a": 1')
  })
})
