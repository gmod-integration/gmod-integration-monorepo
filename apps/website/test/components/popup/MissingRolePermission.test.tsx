import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { ErrorBoundary } from 'solid-js/web'
import { historyAt, renderWithProviders } from '../../testUtils.js'
import type * as APIModule from '../../../src/utils/api.js'

vi.mock('../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof APIModule>()
  return {
    ...actual,
    // GuildInformations.tsx's module-level guildRoles/guildChannels resources also go through
    // this same fetchAPI mock at import time, so the default has to satisfy their array-shaped
    // response too (only the subordination endpoint returns an object keyed by role id).
    fetchAPI: vi.fn((endpoint: string) => {
      if (endpoint.includes('/bot/roles/subordination')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    }),
  }
})

const { guildRolesMutate } = await import('../../../src/pages/dashboard/guilds/GuildInformations.js')
const { fetchAPI } = await import('../../../src/utils/api.js')
const MissingRolePermission = (await import('../../../src/components/popup/MissingRolePermission.js')).default
const { setRolesToCheck } = await import('../../../src/components/popup/MissingRolePermission.js')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function mockSubordination(response: Record<string, { name: string; editable: boolean }>) {
  vi.mocked(fetchAPI).mockImplementation((endpoint: string) => {
    if (endpoint.includes('/bot/roles/subordination')) {
      return Promise.resolve({ ok: true, json: async () => response } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response)
  })
}

describe('components/popup/MissingRolePermission.tsx', () => {
  beforeEach(() => {
    vi.mocked(fetchAPI).mockClear()
    setRolesToCheck([])
    guildRolesMutate([
      { id: 'r1', name: 'RoleOne', color: 111, colorHex: '#111111' },
      { id: 'r2', name: 'RoleTwo', color: 222, colorHex: '#222222' },
    ])
  })

  it('does not request permissions when there are no roles to check', async () => {
    mockSubordination({})
    setRolesToCheck([])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await Promise.resolve()
    expect(fetchAPI).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('flags a role as missing permission when the bot subordination response has no entry for it', async () => {
    mockSubordination({})
    setRolesToCheck(['r1'])
    renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(screen.getByText('@RoleOne')).toBeInTheDocument())
    expect(screen.getByText(/cannot assign or remove these roles/)).toBeInTheDocument()
  })

  it('does not flag a role that is present and editable', async () => {
    mockSubordination({ r1: { name: 'RoleOne', editable: true } })
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalled())
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('flags a role that is present but not editable', async () => {
    mockSubordination({ r2: { name: 'RoleTwo', editable: false } })
    setRolesToCheck(['r2'])
    renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(screen.getByText('@RoleTwo')).toBeInTheDocument())
  })

  it('setRolesToCheck is a no-op when given the same roles (avoids redundant store writes)', async () => {
    mockSubordination({})
    setRolesToCheck(['r1'])
    setRolesToCheck(['r1'])
    renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(screen.getByText('@RoleOne')).toBeInTheDocument())
  })

  it('shows loading without claiming that unknown permissions are missing', async () => {
    vi.mocked(fetchAPI).mockImplementation(() => new Promise(() => {}))
    setRolesToCheck(['r1'])
    renderWithProviders(() => <MissingRolePermission />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByText(/cannot assign or remove these roles/)).not.toBeInTheDocument()
  })

  it.each(['network', 'http', 'json', 'shape'] as const)(
    'keeps a %s failure inside the permission check and retries successfully',
    async (failure) => {
      vi.mocked(fetchAPI).mockImplementation(async () => {
        if (failure === 'network') throw new Error('network down')
        return {
          ok: failure !== 'http',
          json: async () => {
            if (failure === 'json') throw new SyntaxError('Invalid JSON')
            if (failure === 'shape') return { r1: { name: 'RoleOne' } }
            return { r1: { name: 'RoleOne', editable: false } }
          },
        } as Response
      })
      setRolesToCheck(['r1'])
      renderWithProviders(() => (
        <ErrorBoundary fallback={(err) => <div data-testid="boundary-error">{err.message}</div>}>
          <MissingRolePermission />
        </ErrorBoundary>
      ))
      await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(screen.queryByTestId('boundary-error')).not.toBeInTheDocument()
      expect(screen.queryByText(/cannot assign or remove these roles/)).not.toBeInTheDocument()
      mockSubordination({ r1: { name: 'RoleOne', editable: false } })
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await vi.waitFor(() => expect(screen.getByText('@RoleOne')).toBeInTheDocument())
      expect(screen.getByText(/cannot assign or remove these roles/)).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByTestId('boundary-error')).not.toBeInTheDocument()
    },
  )

  it('updates the warning when the roles to check change', async () => {
    mockSubordination({ r1: { name: 'RoleOne', editable: true }, r2: { name: 'RoleTwo', editable: false } })
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
    setRolesToCheck(['r2'])
    await vi.waitFor(() => expect(screen.getByText('@RoleTwo')).toBeInTheDocument())
    setRolesToCheck([])
    expect(container).toBeEmptyDOMElement()
  })

  it('checks newly added roles against fresh permissions instead of the previous snapshot', async () => {
    mockSubordination({ r1: { name: 'RoleOne', editable: true } })
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
    mockSubordination({ r1: { name: 'RoleOne', editable: true }, r2: { name: 'RoleTwo', editable: true } })
    setRolesToCheck(['r1', 'r2'])
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(screen.queryByText(/cannot assign or remove these roles/)).not.toBeInTheDocument()
  })

  it.each(['focus', 'visibility', 'interval'] as const)(
    'refreshes a changed Discord hierarchy on %s without remounting',
    async (trigger) => {
      vi.useFakeTimers()
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      mockSubordination({ r1: { name: 'RoleOne', editable: false } })
      setRolesToCheck(['r1'])
      const { container } = renderWithProviders(() => <MissingRolePermission />)
      await vi.advanceTimersByTimeAsync(0)
      expect(screen.getByText('@RoleOne')).toBeInTheDocument()
      mockSubordination({ r1: { name: 'RoleOne', editable: true } })

      if (trigger === 'focus') window.dispatchEvent(new Event('focus'))
      else if (trigger === 'visibility') document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(trigger === 'interval' ? 30_000 : 0)

      expect(fetchAPI).toHaveBeenCalledTimes(2)
      expect(container).toBeEmptyDOMElement()
    },
  )

  it('pauses background refreshes while hidden and resumes when the page becomes visible', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mockSubordination({ r1: { name: 'RoleOne', editable: false } })
    setRolesToCheck(['r1'])
    renderWithProviders(() => <MissingRolePermission />)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('focus'))
    expect(fetchAPI).toHaveBeenCalledOnce()

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
  })

  it('keeps a failed refresh unknown and retries without displaying the old hierarchy warning', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    mockSubordination({ r1: { name: 'RoleOne', editable: false } })
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(screen.getByText('@RoleOne')).toBeInTheDocument())
    vi.mocked(fetchAPI).mockRejectedValue(new Error('Discord is unavailable'))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/cannot assign or remove these roles/)).not.toBeInTheDocument()

    mockSubordination({ r1: { name: 'RoleOne', editable: true } })
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('cancels a stalled lookup after 15 seconds and allows a successful retry', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    vi.mocked(fetchAPI).mockImplementationOnce(
      (_endpoint, _method, _body, options) =>
        new Promise<Response>((_resolve, reject) => {
          signal = options!.signal!
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(signal.aborted).toBe(true)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    mockSubordination({ r1: { name: 'RoleOne', editable: true } })
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(container).toBeEmptyDOMElement()
  })

  it('serializes checks and coalesces focus, visibility and role changes while a request is pending', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let complete!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementationOnce(() => new Promise<Response>((resolve) => (complete = resolve)))
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledOnce()
    mockSubordination({ r2: { name: 'RoleTwo', editable: true } })
    setRolesToCheck(['r1', 'r2'])
    setRolesToCheck(['r2'])
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledOnce()

    complete({ ok: true, json: async () => ({ r2: { name: 'RoleTwo', editable: false } }) } as Response)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(container).toBeEmptyDOMElement()
  })

  it('discards a late guild response and checks the newly selected guild with an explicit scope', async () => {
    vi.useFakeTimers()
    const history = historyAt('/dashboard/guilds/g1/config/verifications')
    let complete!: (response: Response) => void
    vi.mocked(fetchAPI).mockImplementationOnce(() => new Promise<Response>((resolve) => (complete = resolve)))
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />, {
      path: '/dashboard/guilds/:guildID/config/verifications',
      history,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchAPI).toHaveBeenLastCalledWith('/users/:discordID/guilds/g1/bot/roles/subordination', 'GET', undefined, {
      signal: expect.anything(),
    })
    mockSubordination({ r1: { name: 'RoleOne', editable: true } })
    history.set({ value: '/dashboard/guilds/g2/config/verifications' })
    await vi.advanceTimersByTimeAsync(0)
    complete({ ok: true, json: async () => ({ r1: { name: 'RoleOne', editable: false } }) } as Response)
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(fetchAPI).toHaveBeenLastCalledWith('/users/:discordID/guilds/g2/bot/roles/subordination', 'GET', undefined, {
      signal: expect.anything(),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('releases a queued guild check when the previous guild lookup stalls', async () => {
    vi.useFakeTimers()
    const history = historyAt('/dashboard/guilds/g1/config/verifications')
    let signal!: AbortSignal
    vi.mocked(fetchAPI).mockImplementationOnce(
      (_endpoint, _method, _body, options) =>
        new Promise<Response>((_resolve, reject) => {
          signal = options!.signal!
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    setRolesToCheck(['r1'])
    const { container } = renderWithProviders(() => <MissingRolePermission />, {
      path: '/dashboard/guilds/:guildID/config/verifications',
      history,
    })
    await vi.advanceTimersByTimeAsync(0)
    mockSubordination({ r1: { name: 'RoleOne', editable: true } })
    history.set({ value: '/dashboard/guilds/g2/config/verifications' })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchAPI).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)

    expect(signal.aborted).toBe(true)
    expect(fetchAPI).toHaveBeenCalledTimes(2)
    expect(fetchAPI).toHaveBeenLastCalledWith('/users/:discordID/guilds/g2/bot/roles/subordination', 'GET', undefined, {
      signal: expect.anything(),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('removes refresh listeners and timers and abandons queued checks after unmount', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let signal!: AbortSignal
    vi.mocked(fetchAPI).mockImplementationOnce(
      (_endpoint, _method, _body, options) =>
        new Promise<Response>((_resolve, reject) => {
          signal = options!.signal!
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    setRolesToCheck(['r1'])
    const { unmount } = renderWithProviders(() => <MissingRolePermission />)
    await vi.advanceTimersByTimeAsync(0)
    setRolesToCheck(['r2'])
    unmount()
    expect(signal.aborted).toBe(true)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchAPI).toHaveBeenCalledOnce()
  })
})
