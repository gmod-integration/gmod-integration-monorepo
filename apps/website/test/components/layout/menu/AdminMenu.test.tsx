import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { historyAt, renderWithProviders } from '../../../testUtils.js'
import { AdminMenu } from '../../../../src/components/layout/menu/AdminMenu.js'

afterEach(() => cleanup())

function renderAt(path: string) {
  const history = historyAt(path)
  return renderWithProviders(() => <AdminMenu />, { path: '*', history })
}

describe('components/layout/menu/AdminMenu.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the Admin header and every link with none marked current on a non-matching sub-path', () => {
    renderAt('/dashboard/admins/informations')

    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Informations')).toBeInTheDocument()
    expect(screen.getByText('Guilds')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
    expect(screen.getByText('Impersonate')).toBeInTheDocument()

    const informationsLink = screen.getByText('Informations').closest('a')
    expect(informationsLink).toHaveAttribute('href', '/dashboard/admins/informations')
    expect(informationsLink).toHaveClass('bg-base-200')

    const guildsLink = screen.getByText('Guilds').closest('a')
    expect(guildsLink).not.toHaveClass('bg-base-200')
  })

  it('marks a different link as current when the pathname matches it', () => {
    renderAt('/dashboard/admins/users')

    const usersLink = screen.getByText('Users').closest('a')
    expect(usersLink).toHaveClass('bg-base-200')
    const informationsLink = screen.getByText('Informations').closest('a')
    expect(informationsLink).not.toHaveClass('bg-base-200')
  })

  it('renders no links when the path matches the /servers/ condition exclusion', () => {
    renderAt('/dashboard/admins/servers/somewhere')

    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByText('Informations')).not.toBeInTheDocument()
    expect(screen.queryByText('Guilds')).not.toBeInTheDocument()
  })

  it('toggles collapse: hides labels and shows the double-right icon, then double-left again on re-expand', () => {
    const { container } = renderAt('/dashboard/admins/informations')

    expect(screen.getByText('Collapse')).toBeInTheDocument()
    const collapseRow = screen.getByText('Collapse').closest('div.flex.flex-col.mt-auto')!

    fireEvent.click(collapseRow)

    // Admin label and Collapse label are both gated on `!onlyShowEmoji() || hoverExpand()`.
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Collapse')).not.toBeInTheDocument()
    expect(container.querySelector('.fa-angle-double-right')).toBeInTheDocument()

    fireEvent.click(collapseRow)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Collapse')).toBeInTheDocument()
    expect(container.querySelector('.fa-angle-double-left')).toBeInTheDocument()
  })

  it('shows an "Expand" label and re-reveals content on hover while collapsed, hiding again on mouse leave', () => {
    const { container } = renderAt('/dashboard/admins/informations')
    const collapseRow = screen.getByText('Collapse').closest('div.flex.flex-col.mt-auto')!
    fireEvent.click(collapseRow) // collapse first

    const outer = container.querySelector('div.flex.flex-col.p-4.gap-2')!
    expect(outer).not.toHaveClass('min-w-[240px]')

    fireEvent.mouseEnter(outer)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Expand')).toBeInTheDocument()
    expect(outer).toHaveClass('min-w-[240px]')

    fireEvent.mouseLeave(outer)
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Expand')).not.toBeInTheDocument()
  })
})
