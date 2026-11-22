import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { AppAdminDashboard } from '../../src/app/AppAdminDashboard.js'

afterEach(() => cleanup())
beforeEach(() => window.localStorage.clear())

describe('Admin dashboard shell', () => {
  it('composes the named admin navigation and page content', () => {
    renderWithProviders(() => (
      <AppAdminDashboard>
        <div data-testid="page">Admin page</div>
      </AppAdminDashboard>
    ))
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByTestId('page')).toHaveTextContent('Admin page')
  })

  it('contains page failures and recovers through the same retry control as the guild dashboard', () => {
    let shouldFail = true
    function FailablePage() {
      if (shouldFail) throw new Error('admin page crashed')
      return <div>Recovered admin page</div>
    }
    expect(() =>
      renderWithProviders(() => (
        <AppAdminDashboard>
          <FailablePage />
        </AppAdminDashboard>
      )),
    ).not.toThrow()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This page could not be displayed. Try again to reload its content.',
    )
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()

    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Recovered admin page')).toBeInTheDocument()
  })
})
