import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import AdminPanel from '../../src/components/AdminPanel.js'
import { linkBadge } from '../../src/components/layout/menu/DashboardMenu.js'

afterEach(() => cleanup())

function setGuildPremium(isPremium: boolean) {
  window.localStorage.setItem('guilds', JSON.stringify({ isPremium }))
}

describe('components/AdminPanel.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders title, description, and children', () => {
    renderWithProviders(() => (
      <AdminPanel title="My Panel" description="Panel description">
        <div data-testid="child">panel body</div>
      </AdminPanel>
    ))
    expect(screen.getByText('My Panel')).toBeInTheDocument()
    expect(screen.getByText('Panel description')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('does not render a badge when badge prop is absent', () => {
    renderWithProviders(() => <AdminPanel title="t" description="d" />)
    expect(screen.queryByText(/badge_/)).not.toBeInTheDocument()
  })

  it('renders a translated badge when badge prop is provided', () => {
    renderWithProviders(() => <AdminPanel title="t" description="d" badge={linkBadge.NEW} />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('does not render the info row when info is absent', () => {
    const { container } = renderWithProviders(() => <AdminPanel title="t" description="d" />)
    expect(container.querySelector('.fa-circle-info')).not.toBeInTheDocument()
  })

  it('renders the info row when info is provided', () => {
    renderWithProviders(() => <AdminPanel title="t" description="d" info="Some extra info" />)
    expect(screen.getByText('Some extra info')).toBeInTheDocument()
  })

  it('does not show the premium banner when premium is not set', () => {
    setGuildPremium(false)
    renderWithProviders(() => <AdminPanel title="t" description="d" />)
    expect(screen.queryByRole('link', { name: 'Upgrade Now' })).not.toBeInTheDocument()
  })

  it('does not show the premium banner when the guild already has premium', () => {
    setGuildPremium(true)
    renderWithProviders(() => <AdminPanel title="t" description="d" premium />)
    expect(screen.queryByRole('link', { name: 'Upgrade Now' })).not.toBeInTheDocument()
  })

  it('shows the default premium message and upgrade link when premium is true and guild lacks premium', () => {
    setGuildPremium(false)
    renderWithProviders(() => <AdminPanel title="t" description="d" premium />)
    expect(screen.getByText(/This feature is only available to premium users\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upgrade Now' })).toHaveAttribute('href', '/premium')
  })

  it('shows a custom premium message string when premium is a string and guild lacks premium', () => {
    setGuildPremium(false)
    renderWithProviders(() => <AdminPanel title="t" description="d" premium="Custom premium copy" />)
    expect(screen.getByText(/Custom premium copy/)).toBeInTheDocument()
  })

  it('applies gap/padding classes when type is not "none"', () => {
    const { container } = renderWithProviders(() => <AdminPanel title="t" description="d" />)
    const childrenWrapper = container.querySelector('hr + div')
    expect(childrenWrapper).toHaveClass('gap-4', 'p-4')
  })

  it('omits gap/padding classes when type is "none"', () => {
    const { container } = renderWithProviders(() => <AdminPanel title="t" description="d" type="none" />)
    const childrenWrapper = container.querySelector('hr + div')
    expect(childrenWrapper).not.toHaveClass('gap-4')
    expect(childrenWrapper).not.toHaveClass('p-4')
  })
})
