import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { PremiumFeature } from '../../../src/components/popup/NeedPremium.js'

afterEach(() => cleanup())

function setGuildPremium(isPremium: boolean) {
  window.localStorage.setItem('guilds', JSON.stringify({ isPremium }))
}

describe('components/popup/NeedPremium.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders nothing when the guild is premium', () => {
    setGuildPremium(true)
    renderWithProviders(() => <PremiumFeature />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders the default message and an upgrade link when not premium', () => {
    setGuildPremium(false)
    renderWithProviders(() => <PremiumFeature />)
    expect(screen.getByText('This feature requires a premium plan.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Upgrade Now' })
    expect(link).toHaveAttribute('href', '/premium')
  })

  it('renders a custom message when provided', () => {
    setGuildPremium(false)
    renderWithProviders(() => <PremiumFeature message="Custom premium message" />)
    expect(screen.getByText('Custom premium message')).toBeInTheDocument()
  })
})
