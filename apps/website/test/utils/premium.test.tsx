import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { afterEach } from 'vitest'
import { renderWithProviders } from '../testUtils.js'
import { BuyPremiumBtn, PremiumBadge, premium } from '../../src/utils/premium.js'

afterEach(() => cleanup())

function setGuildPremium(isPremium: boolean) {
  window.localStorage.setItem('guilds', JSON.stringify({ isPremium }))
}

describe('utils/premium.tsx', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('premium()', () => {
    it('does not grant access from an unverified stored flag outside the provider', () => {
      setGuildPremium(true)
      expect(premium()).toBe(false)
    })

    it('reads the verified provider snapshot inside a rendered component', () => {
      setGuildPremium(true)
      renderWithProviders(() => <span>{premium() ? 'Verified Premium' : 'Free'}</span>)
      expect(screen.getByText('Verified Premium')).toBeInTheDocument()
    })
  })

  describe('PremiumBadge', () => {
    it('renders nothing when the guild is premium', () => {
      setGuildPremium(true)
      renderWithProviders(() => <PremiumBadge />)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('renders an icon-only badge link when onlyIcon is set', () => {
      setGuildPremium(false)
      renderWithProviders(() => <PremiumBadge onlyIcon />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/premium')
      expect(link.querySelector('svg[data-icon="crown"]')).toBeInTheDocument()
    })

    it('renders the full badge with text when onlyIcon is not set', () => {
      setGuildPremium(false)
      renderWithProviders(() => <PremiumBadge />)
      expect(screen.getByText('Premium')).toBeInTheDocument()
    })
  })

  describe('BuyPremiumBtn', () => {
    it('renders nothing when hidden is true', () => {
      renderWithProviders(() => <BuyPremiumBtn hidden>content</BuyPremiumBtn>)
      expect(screen.queryByText('content')).not.toBeInTheDocument()
    })

    it('renders children when the guild is premium', () => {
      setGuildPremium(true)
      renderWithProviders(() => <BuyPremiumBtn>content</BuyPremiumBtn>)
      expect(screen.getByText('content')).toBeInTheDocument()
    })

    it('renders children when subCondition is true even without premium', () => {
      setGuildPremium(false)
      renderWithProviders(() => <BuyPremiumBtn subCondition>content</BuyPremiumBtn>)
      expect(screen.getByText('content')).toBeInTheDocument()
    })

    it('defaults subCondition to true (renders children) when not premium and subCondition is omitted', () => {
      setGuildPremium(false)
      renderWithProviders(() => <BuyPremiumBtn>content</BuyPremiumBtn>)
      expect(screen.getByText('content')).toBeInTheDocument()
    })

    it('keeps the action visible beside an upgrade link when its free quota is reached', () => {
      setGuildPremium(false)
      renderWithProviders(() => <BuyPremiumBtn subCondition={false}>content</BuyPremiumBtn>)
      expect(screen.getByText('content')).toBeInTheDocument()
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/premium')
    })

    it('uses a custom btnText for the fallback link when provided', () => {
      setGuildPremium(false)
      renderWithProviders(() => (
        <BuyPremiumBtn subCondition={false} btnText="Custom text">
          content
        </BuyPremiumBtn>
      ))
      expect(screen.getByText('Custom text')).toBeInTheDocument()
    })
  })
})
