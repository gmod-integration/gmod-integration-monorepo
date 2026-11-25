import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import type { DashboardAccessDenialReason } from '@gmod/schema/user/DashboardAccessSchema.js'
import DashboardAccessHelpModal, {
  DASHBOARD_ACCESS_HELP_DIALOG_ID,
} from '../../src/components/DashboardAccessHelpModal.js'
import { closeDialog, showDialog } from '../../src/utils/dialog.js'
import { renderWithProviders } from '../testUtils.js'

const dialog = (id = DASHBOARD_ACCESS_HELP_DIALOG_ID) => document.getElementById(id) as HTMLDialogElement
beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('dashboard access guidance', () => {
  it('stays closed until requested and explains the actual access and synchronization procedure', () => {
    const recheck = vi.fn()
    renderWithProviders(() => <DashboardAccessHelpModal onRecheck={recheck} />)
    expect(dialog()).not.toHaveAttribute('open')
    expect(recheck).not.toHaveBeenCalled()
    showDialog(DASHBOARD_ACCESS_HELP_DIALOG_ID)
    const modal = screen.getByRole('dialog', { name: 'Get dashboard access' })
    expect(modal).toHaveAccessibleDescription(
      'Access uses your Discord permissions and the game administrator group reported by the addon.',
    )
    expect(within(modal).getAllByRole('listitem')).toHaveLength(4)
    const procedure = within(modal).getByRole('region', { name: 'Access requirements and steps' })
    procedure.focus()
    expect(document.activeElement).toBe(procedure)
    expect(within(modal).getByText(/Discord Administrator permission and a linked Steam account/)).toBeInTheDocument()
    expect(
      within(modal).getByText(/buyer whose active GmodStore purchase is assigned to this community/),
    ).toBeInTheDocument()
    expect(
      within(modal).getByText(/Ask the game server owner to give your Steam account an administrator group/),
    ).toBeInTheDocument()
    expect(within(modal).getByText(/join the game server once/)).toHaveTextContent(
      'You do not need to stay connected to the game.',
    )
    expect(within(modal).getByRole('link', { name: 'Open Account' })).toHaveAttribute('href', '/account')
    expect(within(modal).getByRole('link', { name: 'Choose another community' })).toHaveAttribute(
      'href',
      '/dashboard/guilds',
    )
    expect(recheck).not.toHaveBeenCalled()
  })

  it.each<Array<[DashboardAccessDenialReason, string]>[number]>([
    ['discord_admin_required', 'This Discord account needs the Administrator permission in the community.'],
    ['steam_link_required', 'Link your Steam account so its game administrator group can be checked.'],
    [
      'game_admin_required',
      'Your linked Steam account does not yet have a recorded game administrator group for the dashboard you requested.',
    ],
    [
      'scope_unavailable',
      'This community or game server could not be verified. Choose the correct community or ask its owner to check the setup.',
    ],
  ])('explains the specific %s denial without assigning any permission itself', (reason, message) => {
    renderWithProviders(() => <DashboardAccessHelpModal reason={reason} />)
    showDialog(DASHBOARD_ACCESS_HELP_DIALOG_ID)
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(message)
    expect(within(dialog()).queryByRole('button', { name: 'Recheck access' })).not.toBeInTheDocument()
  })

  it('rechecks only on request, prevents duplicate checks while loading and leaves success closure to its parent', async () => {
    const [loading, setLoading] = createSignal(false)
    const recheck = vi.fn(() => setLoading(true))
    renderWithProviders(() => <DashboardAccessHelpModal loading={loading()} onRecheck={recheck} />)
    showDialog(DASHBOARD_ACCESS_HELP_DIALOG_ID)
    const button = within(dialog()).getByRole('button', { name: 'Recheck access' })
    await fireEvent.click(button)
    expect(recheck).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    expect(dialog()).toHaveAttribute('open')
    await fireEvent.click(button)
    expect(recheck).toHaveBeenCalledOnce()
    setLoading(false)
    expect(button).toBeEnabled()
    expect(dialog()).toHaveAttribute('open')
    closeDialog(DASHBOARD_ACCESS_HELP_DIALOG_ID)
    expect(dialog()).not.toHaveAttribute('open')
  })

  it('allows Close and native Escape while a read-only access check is pending', async () => {
    const recheck = vi.fn()
    renderWithProviders(() => <DashboardAccessHelpModal id="custom-access-help" loading onRecheck={recheck} />)
    showDialog('custom-access-help')
    const modal = dialog('custom-access-help')
    const buttons = within(modal).getAllByRole('button', { name: 'Close' })
    expect(buttons.every((button) => !button.hasAttribute('disabled'))).toBe(true)
    await fireEvent.click(buttons.at(-1)!)
    expect(modal).not.toHaveAttribute('open')
    showDialog('custom-access-help')
    const cancellation = new Event('cancel', { cancelable: true })
    await fireEvent(modal, cancellation)
    expect(cancellation.defaultPrevented).toBe(false)
    expect(modal).not.toHaveAttribute('open')
    expect(recheck).not.toHaveBeenCalled()
  })

  it('renders the procedure and actionable destinations in French', () => {
    localStorage.setItem('locale', 'fr')
    renderWithProviders(() => <DashboardAccessHelpModal reason="steam_link_required" onRecheck={() => {}} />)
    showDialog(DASHBOARD_ACCESS_HELP_DIALOG_ID)
    const modal = screen.getByRole('dialog', { name: 'Obtenir l’accès au dashboard' })
    expect(within(modal).getByRole('alert')).toHaveTextContent('Liez votre compte Steam')
    expect(within(modal).getByRole('link', { name: 'Ouvrir mon compte' })).toHaveAttribute('href', '/account')
    expect(within(modal).getByRole('button', { name: 'Revérifier l’accès' })).toBeEnabled()
    expect(within(modal).getByText(/rejoignez le serveur de jeu une fois/)).toHaveTextContent(
      'Vous n’avez pas besoin de rester connecté au jeu.',
    )
  })
})
