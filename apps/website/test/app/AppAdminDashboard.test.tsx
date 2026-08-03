import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { AppAdminDashboard } from '../../src/app/AppAdminDashboard.js'

afterEach(() => cleanup())

function Boom(): never {
  throw new Error('admin page crashed')
}

describe('app/AppAdminDashboard.tsx', () => {
  it('renders the AdminMenu and children in the layout', () => {
    renderWithProviders(() => (
      <AppAdminDashboard>
        <div data-testid="page">Admin page</div>
      </AppAdminDashboard>
    ))

    expect(screen.getByText('Admin')).toBeInTheDocument() // AdminMenu header
    expect(screen.getByTestId('page')).toBeInTheDocument()
  })

  it("catches a throwing child in the ErrorBoundary without re-throwing from the fallback's own render", () => {
    expect(() =>
      renderWithProviders(() => (
        <AppAdminDashboard>
          <Boom />
        </AppAdminDashboard>
      )),
    ).not.toThrow()

    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Error : admin page crashed'),
    ).toBeInTheDocument()
    expect(document.querySelector('.fa-circle-xmark')).toBeInTheDocument()
  })
})
