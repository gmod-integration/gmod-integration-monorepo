import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import Premium from '../../src/pages/Premium.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('pages/Premium.tsx', () => {
  it('renders the title and subtitle', () => {
    renderWithProviders(() => <Premium />)
    expect(screen.getByText('Premium', { selector: 'h1' })).toBeInTheDocument()
    expect(
      screen.getByText('Upgrade your community to the next level with customisation and more features'),
    ).toBeInTheDocument()
  })

  describe('offer cards', () => {
    it('renders the free offer at $0 with no discount UI and links to the guild setup flow', () => {
      renderWithProviders(() => <Premium />)
      const card = screen.getByText('Free', { selector: 'h2' }).closest('a')!
      expect(card).toHaveAttribute('href', '/dashboard/guilds')
      expect(within(card).getByText('$0')).toBeInTheDocument()
      expect(within(card).queryByText(/% off until/)).not.toBeInTheDocument()
      expect(within(card).getByText('Setup Server')).toBeInTheDocument()
      expect(within(card).getByText('All Free Features')).toBeInTheDocument()
    })

    it('renders the subscribe offer at its listed price, linking to the Discord app directory', () => {
      renderWithProviders(() => <Premium />)
      const card = screen.getByText('Subscribe', { selector: 'h2' }).closest('a')!
      expect(card).toHaveAttribute('href', 'https://discord.com/application-directory/1110121451501129758/premium')
      expect(within(card).getByText('$7.99')).toBeInTheDocument()
      expect(within(card).getByText('Subscribe on Discord')).toBeInTheDocument()
    })

    it('renders the one-time offer at full price with no discount once the reduction window has passed', () => {
      // The hardcoded reduction end date (2024-09-22) is in the past relative to any realistic
      // test run, so offers.buy.reduction is deleted by the component's own module-scope cleanup
      // loop under real system time - this is the normal, everyday code path.
      renderWithProviders(() => <Premium />)
      const card = screen.getByText('One Time', { selector: 'h2' }).closest('a')!
      expect(card).toHaveAttribute('href', 'https://www.gmodstore.com/market/view/gmod-integration')
      expect(within(card).getByText('$69.99')).toBeInTheDocument()
      expect(within(card).queryByText(/% off until/)).not.toBeInTheDocument()
      expect(within(card).getByText('Buy on Gmod Store')).toBeInTheDocument()
      expect(within(card).getByText('Custom Bot')).toBeInTheDocument()
    })

    it('shows the discounted price and countdown text while the reduction window is still active', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

      renderWithProviders(() => <Premium />)
      const card = screen.getByText('One Time', { selector: 'h2' }).closest('a')!

      // 69.99 - 69.99 * 15 / 100 = 59.4915 -> toFixed(2)
      expect(within(card).getByText('$59.49')).toBeInTheDocument()
      // The struck-through original price is rendered alongside the discounted one.
      expect(within(card).getByText('$69.99')).toBeInTheDocument()
      const expectedDate = new Date('2024-09-22T23:59:59').toLocaleDateString()
      expect(within(card).getByText(`15% off until ${expectedDate}`)).toBeInTheDocument()
    })
  })

  describe('plans comparison table', () => {
    it('renders every category with its name as a table header', () => {
      renderWithProviders(() => <Premium />)
      expect(screen.getByText('Plans Comparison')).toBeInTheDocument()
      for (const name of ['Server', 'Utility', 'Data & Statistics', 'Security', 'Synchronization']) {
        expect(screen.getByText(name, { selector: 'th' })).toBeInTheDocument()
      }
    })

    it('renders a check icon for a true value and a times icon for a false value', () => {
      const { container } = renderWithProviders(() => <Premium />)
      const row = screen.getByText('Sync Chat - Customisation').closest('tr')!
      // free_value: false, premium_value: true
      expect(row.querySelector('.fa-times.text-error')).toBeInTheDocument()
      expect(row.querySelector('.fa-check.text-success')).toBeInTheDocument()
      expect(container.querySelectorAll('.fa-check.text-success').length).toBeGreaterThan(1)
    })

    it('renders an infinity icon when the value equals the translated "infinite" string', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('Servers').closest('tr')!
      expect(within(row).getByText('1 server')).toBeInTheDocument() // free_value: raw text
      expect(row.querySelector('.fa-infinity.text-primary')).toBeInTheDocument() // premium_value: infinite
    })

    it('renders raw string values as-is for both free and premium columns', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('Server Status - Buttons Limit').closest('tr')!
      expect(within(row).getByText('2 buttons')).toBeInTheDocument()
      expect(within(row).getByText('25 buttons')).toBeInTheDocument()
    })

    it('renders an interpolated translation value (e.g. "{1} hours" -> "24 hours")', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('WebPanel Logs').closest('tr')!
      expect(within(row).getByText('24 hours')).toBeInTheDocument()
      expect(row.querySelector('.fa-infinity.text-primary')).toBeInTheDocument()
    })

    it('wraps an in-development feature name in a warning tooltip instead of rendering it plainly', () => {
      renderWithProviders(() => <Premium />)
      const name = screen.getByText('Team Vocal')
      const tooltip = name.closest('[data-tip]')!
      expect(tooltip).toHaveClass('tooltip-warning')
      expect(tooltip.querySelector('.fa-triangle-exclamation')).toBeInTheDocument()
    })

    it('renders a non-in-development feature name without a tooltip wrapper', () => {
      renderWithProviders(() => <Premium />)
      const name = screen.getByText('Server Status')
      expect(name.closest('[data-tip]')).toBeNull()
    })
  })

  describe('FAQ section', () => {
    it('renders every FAQ entry as a collapsible item sharing one accordion group', () => {
      const { container } = renderWithProviders(() => <Premium />)
      expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument()
      const items = container.querySelectorAll('.collapse.collapse-arrow')
      expect(items).toHaveLength(8)
      items.forEach((item) => {
        expect(item.querySelector('input[type="radio"]')).toHaveAttribute('name', 'my-accordion-4')
      })
      expect(
        screen.getByText('What are the differences between the free and the premium version ?'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Why so many features are in development ?'),
      ).toBeInTheDocument()
    })
  })
})
