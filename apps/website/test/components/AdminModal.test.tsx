import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import AdminModal from '../../src/components/AdminModal.js'

afterEach(() => cleanup())

describe('components/AdminModal.tsx', () => {
  it('renders the title, id, close button, and children inside a dialog', () => {
    const { container } = render(() => (
      <AdminModal title="My Modal" id="my_modal">
        <div data-testid="child">modal body</div>
      </AdminModal>
    ))
    const dialog = container.querySelector('dialog#my_modal')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('My Modal')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toHaveTextContent('modal body')
    expect(container.querySelector('form[method="dialog"] button')).toBeInTheDocument()
  })
})
