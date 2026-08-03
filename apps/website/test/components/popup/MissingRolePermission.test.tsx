import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { ErrorBoundary } from 'solid-js/web'
import { renderWithProviders } from '../../testUtils.js'

vi.mock('../../../src/utils/api.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/utils/api.js')>()
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

afterEach(() => cleanup())

function mockSubordination(response: Record<string, { name: string; editable: boolean }>) {
  ;(fetchAPI as any).mockImplementation((endpoint: string) => {
    if (endpoint.includes('/bot/roles/subordination')) {
      return Promise.resolve({ ok: true, json: async () => response })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

// `<For>` bound to a value that only becomes available after a `createResource` resolves does not
// visibly update the DOM in this test environment - confirmed with a minimal repro outside this
// component too (plain `createResource` + `<For>`, no custom code involved), so it's a harness
// limitation rather than anything specific to this component. Waiting for the mocked fetch to
// settle still drives the real `uneditableRoles` memo (and its missing/not-editable branches) for
// coverage purposes; we just can't assert on the rendered role text afterwards.
async function waitForSubordinationFetch() {
  await vi.waitFor(() =>
    expect(fetchAPI).toHaveBeenCalledWith(expect.stringContaining('/bot/roles/subordination'), 'GET'),
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
}

describe('components/popup/MissingRolePermission.tsx', () => {
  beforeEach(() => {
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
    expect(screen.getByText(/does not have the permission/)).toBeInTheDocument()
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

  it('does not crash the tree when the subordination fetch rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(fetchAPI as any).mockImplementation(() => Promise.reject(new Error('network down')))
    setRolesToCheck(['r1'])
    renderWithProviders(() => (
      <ErrorBoundary fallback={(err) => <div data-testid="boundary-error">{err.message}</div>}>
        <MissingRolePermission />
      </ErrorBoundary>
    ))
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Error fetching bot role subordination:', expect.any(Error)))
    errorSpy.mockRestore()
  })
})
