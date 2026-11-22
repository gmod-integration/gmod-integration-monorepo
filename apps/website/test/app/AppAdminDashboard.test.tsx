import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../testUtils.js'
import { AppAdminDashboard } from '../../src/app/AppAdminDashboard.js'
import { acceptAuthSession, resetAuthentication } from '../../src/utils/authClient.js'
import { sessionFixture } from '../authFixture.js'

vi.mock('../../src/utils/api.js', () => ({
  fetchAPI: vi.fn(async () => new Response(JSON.stringify({ authorized: true, discordID: 'u1' }))),
}))

afterEach(() => {
  cleanup()
  resetAuthentication()
})
beforeEach(() => {
  window.localStorage.clear()
  acceptAuthSession(sessionFixture({ user: { ...sessionFixture().user, rank: 'developer' } }))
})

describe('Admin dashboard shell', () => {
  it.each([
    ['monitoring', 'Monitoring'],
    ['previews', 'Server previews'],
  ])('names the %s page in its heading and breadcrumb', async (path, title) => {
    renderWithProviders(
      () => (
        <AppAdminDashboard>
          <div>Page</div>
        </AppAdminDashboard>
      ),
      { path: '*', history: historyAt(`/dashboard/admins/${path}`) },
    )
    await screen.findByRole('heading', { level: 1, name: title })
  })
  it('composes the named admin navigation and page content after server verification', async () => {
    renderWithProviders(() => (
      <AppAdminDashboard>
        <div data-testid="page">Admin page</div>
      </AppAdminDashboard>
    ))
    await vi.waitFor(() => expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument())
    expect(screen.getByTestId('page')).toHaveTextContent('Admin page')
  })

  it('contains page failures and recovers through the same retry control as the guild dashboard', async () => {
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
    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This page could not be displayed. Try again to reload its content.',
      ),
    )
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()

    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Recovered admin page')).toBeInTheDocument()
  })
})
