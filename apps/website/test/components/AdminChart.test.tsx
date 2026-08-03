import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import AdminChart from '../../src/components/AdminChart.js'

afterEach(() => cleanup())

describe('components/AdminChart.tsx', () => {
  it('renders the name and children', () => {
    render(() => (
      <AdminChart name="My Chart">
        <div data-testid="child">chart body</div>
      </AdminChart>
    ))
    expect(screen.getByText('My Chart')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toHaveTextContent('chart body')
  })
})
