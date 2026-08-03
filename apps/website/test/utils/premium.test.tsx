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
    it('reflects the stored guild isPremium flag', () => {
      setGuildPremium(true)
      expect(premium()).toBe(true)
      setGuildPremium(false)
      expect(premium()).toBe(false)
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
      expect(link.querySelector('.fa-crown')).toBeInTheDocument()
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

    it('renders a fallback buy-premium link when not premium and subCondition is false', () => {
      setGuildPremium(false)
      renderWithProviders(() => <BuyPremiumBtn subCondition={false}>content</BuyPremiumBtn>)
      expect(screen.queryByText('content')).not.toBeInTheDocument()
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
