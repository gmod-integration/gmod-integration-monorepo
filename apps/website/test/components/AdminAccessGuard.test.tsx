import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { AdminAccessGuard } from '../../src/components/AdminAccessGuard.js'
import { acceptAuthSession, resetAuthentication } from '../../src/utils/authClient.js'
import { fetchAPI } from '../../src/utils/api.js'
import { renderWithProviders, historyAt } from '../testUtils.js'
import { sessionFixture } from '../authFixture.js'

vi.mock('../../src/utils/api.js', () => ({ fetchAPI: vi.fn() }))
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const developer = () => sessionFixture({ user: { ...sessionFixture().user, rank: 'developer' } })
const renderGuard = (
  child = () => <input aria-label="Draft" value="saved" />,
  path = '/dashboard/admins/informations',
) =>
  renderWithProviders(() => <AdminAccessGuard>{child()}</AdminAccessGuard>, {
    path: '*',
    history: historyAt(path),
    session: false,
  })
beforeEach(() => {
  localStorage.clear()
  resetAuthentication()
  vi.mocked(fetchAPI)
    .mockReset()
    .mockResolvedValue(response({ authorized: true, discordID: 'u1' }))
})
afterEach(() => {
  cleanup()
  resetAuthentication()
})

describe('server-verified internal administrator guard', () => {
  it('keeps page effects unmounted until a matching own-session acknowledgement', async () => {
    acceptAuthSession(developer())
    let complete!: (value: Response) => void
    vi.mocked(fetchAPI).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const mounted = vi.fn()
    function Page() {
      mounted()
      return <p>Admin page</p>
    }
    renderGuard(() => <Page />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking administrator access')
    expect(mounted).not.toHaveBeenCalled()
    complete(response({ authorized: true, discordID: 'u1' }))
    await vi.waitFor(() => expect(screen.getByText('Admin page')).toBeInTheDocument())
    expect(mounted).toHaveBeenCalledOnce()
  })
  it('does not request or mount administration for ordinary users or support delegates', () => {
    acceptAuthSession(sessionFixture())
    const first = renderGuard()
    expect(screen.getByText('Platform administrator access required')).toBeInTheDocument()
    expect(fetchAPI).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    first.unmount()
    const delegated = developer()
    acceptAuthSession({ ...delegated, session: { ...delegated.session, actorDiscordID: 'operator' } })
    renderGuard()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(fetchAPI).not.toHaveBeenCalled()
  })
  it('preserves an editor after a temporary refresh failure and retries', async () => {
    acceptAuthSession(developer())
    renderGuard()
    const input = await screen.findByRole('textbox', { name: 'Draft' })
    await fireEvent.input(input, { target: { value: 'unsaved' } })
    vi.mocked(fetchAPI)
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ authorized: true, discordID: 'u1' }))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Your unsaved changes are preserved.'))
    expect(screen.getByRole('textbox')).toBe(input)
    expect(input).toHaveValue('unsaved')
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(input).toHaveValue('unsaved')
  })
  it('removes privileged content after access is revoked', async () => {
    acceptAuthSession(developer())
    renderGuard()
    await screen.findByRole('textbox')
    vi.mocked(fetchAPI).mockResolvedValueOnce(response({}, 403))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(screen.getByText('Platform administrator access required')).toBeInTheDocument())
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('permits only the support return route during a delegation', () => {
    const delegated = developer()
    acceptAuthSession({ ...delegated, session: { ...delegated.session, actorDiscordID: 'operator' } })
    renderGuard(() => <p>Return session control</p>, '/dashboard/admins/stop-impersonate')
    expect(screen.getByText('Return session control')).toBeInTheDocument()
    expect(fetchAPI).not.toHaveBeenCalled()
  })
  it('offers sign-in without requesting privileged data when signed out', () => {
    renderGuard()
    expect(screen.getByRole('link', { name: 'Sign in with Discord' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fdashboard%2Fadmins%2Finformations',
    )
    expect(fetchAPI).not.toHaveBeenCalled()
  })
})
