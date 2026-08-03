import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { PremiumOnly } from '../../src/components/PremiumOnly.js'

afterEach(() => cleanup())

function setGuildPremium(isPremium: boolean) {
  window.localStorage.setItem('guilds', JSON.stringify({ isPremium }))
}

describe('components/PremiumOnly.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the premium-only marker when the guild is not premium', () => {
    setGuildPremium(false)
    renderWithProviders(() => <PremiumOnly />)
    expect(screen.getByText(/Premium Only/)).toBeInTheDocument()
  })

  it('renders nothing when the guild is premium', () => {
    setGuildPremium(true)
    const { container } = renderWithProviders(() => <PremiumOnly />)
    expect(container).toBeEmptyDOMElement()
  })
})
