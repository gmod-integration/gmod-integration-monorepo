import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { ErrorBoundary } from 'solid-js/web'
import { renderWithProviders } from '../../testUtils.js'
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

  it('renders nothing when there are no roles to check', async () => {
    mockSubordination({})
    setRolesToCheck([])
    const { container } = renderWithProviders(() => <MissingRolePermission />)
    await vi.waitFor(() => expect(fetchAPI).toHaveBeenCalled())
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
    expect(screen.getByText('@RoleTwo')).toBeInTheDocument()
    setRolesToCheck([])
    expect(container).toBeEmptyDOMElement()
  })
})
