import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import Premium from '../../src/pages/Premium.js'
import { useI18n } from '../../src/i18n.js'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.useRealTimers()
})

describe('pages/Premium.tsx', () => {
  it('renders the title and subtitle', () => {
    renderWithProviders(() => <Premium />)
    expect(screen.getByText('Premium', { selector: 'h1' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Compare the free and Premium features available for your Discord community and its game servers.',
      ),
    ).toBeInTheDocument()
  })

  it('updates offers, comparison rows and FAQ answers when the selected language changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
    const PageWithLanguageSwitch = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <button onClick={() => updateLocale('fr')}>Français</button>
          <Premium />
        </>
      )
    }
    const { container } = renderWithProviders(PageWithLanguageSwitch)
    expect(screen.getByRole('heading', { name: 'Monthly subscription' })).toBeInTheDocument()
    expect(screen.getByText('Game logs in the dashboard')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'What does Premium add?' })).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Français' }))

    const monthly = screen.getByRole('heading', { name: 'Abonnement mensuel' }).closest('a')!
    expect(within(monthly).getByText('$25.99')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Monthly subscription' })).not.toBeInTheDocument()
    expect(screen.getByText('Journaux de jeu dans le tableau de bord').closest('tr')).toBeInTheDocument()
    expect(screen.queryByText('Game logs in the dashboard')).not.toBeInTheDocument()
    const question = screen.getByRole('radio', { name: 'Qu’apporte Premium ?' })
    expect(question.closest('.collapse')).toHaveTextContent(
      'Premium augmente les limites et ajoute les options de personnalisation indiquées dans le comparatif.',
    )
    expect(screen.queryByRole('radio', { name: 'What does Premium add?' })).not.toBeInTheDocument()
    expect(container.querySelector('.premium-comparison')).toHaveTextContent(
      'Les fonctionnalités signalées en développement ne sont pas encore disponibles.',
    )
    const purchase = screen.getByRole('heading', { name: 'Achat unique' }).closest('a')!
    const expectedDate = new Date('2024-09-22T23:59:59').toLocaleDateString('fr')
    expect(within(purchase).getByText(`Réduction de 15 % jusqu’au ${expectedDate}`)).toBeInTheDocument()
    expect(within(purchase).getByText('$220.99')).toBeInTheDocument()
  })

  describe('offer cards', () => {
    it('renders the free offer at $0 with no discount UI and links to the guild setup flow', () => {
      renderWithProviders(() => <Premium />)
      const card = screen.getByText('Free', { selector: 'h2' }).closest('a')!
      expect(card).toHaveAttribute('href', '/dashboard/guilds')
      expect(within(card).getByText('$0')).toBeInTheDocument()
      expect(within(card).queryByText(/% off until/)).not.toBeInTheDocument()
      expect(within(card).getByText('Connect a game server')).toBeInTheDocument()
      expect(within(card).getByText('All Free Features')).toBeInTheDocument()
    })

    it('renders the subscribe offer at its listed price, linking to the Discord app directory', () => {
      renderWithProviders(() => <Premium />)
      const card = screen.getByText('Monthly subscription', { selector: 'h2' }).closest('a')!
      expect(card).toHaveAttribute('href', 'https://discord.com/application-directory/1110121451501129758/premium')
      expect(within(card).getByText('$25.99')).toBeInTheDocument()
      expect(within(card).getByText('Subscribe on Discord')).toBeInTheDocument()
    })

    it('renders the one-time offer at full price with no discount once the reduction window has passed', () => {
      // The hardcoded reduction end date (2024-09-22) is in the past relative to any realistic
      // test run, so offers.buy.reduction is omitted by the offer computation
      // under real system time - this is the normal, everyday code path.
      renderWithProviders(() => <Premium />)
      const card = screen.getByText('One-time purchase', { selector: 'h2' }).closest('a')!
      expect(card).toHaveAttribute('href', 'https://www.gmodstore.com/market/view/gmod-integration')
      expect(within(card).getByText('$259.99')).toBeInTheDocument()
      expect(within(card).queryByText(/% off until/)).not.toBeInTheDocument()
      expect(within(card).getByText('Buy on Gmod Store')).toBeInTheDocument()
      expect(within(card).getByText('Custom Bot')).toBeInTheDocument()
    })

    it('shows the discounted price and countdown text while the reduction window is still active', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

      renderWithProviders(() => <Premium />)
      const card = screen.getByText('One-time purchase', { selector: 'h2' }).closest('a')!

      // 259.99 - 259.99 * 15 / 100 = 220.9915 -> toFixed(2)
      expect(within(card).getByText('$220.99')).toBeInTheDocument()
      // The struck-through original price is rendered alongside the discounted one.
      expect(within(card).getByText('$259.99')).toBeInTheDocument()
      const expectedDate = new Date('2024-09-22T23:59:59').toLocaleDateString('en')
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

    it('names included and excluded features instead of relying on color or an icon alone', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('Sync Chat - Customisation').closest('tr')!
      // free_value: false, premium_value: true
      expect(within(row).getByText('Not included')).toBeVisible()
      expect(within(row).getByText('Included')).toBeVisible()
    })

    it('renders an infinity icon when the value equals the translated "infinite" string', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('Servers').closest('tr')!
      expect(within(row).getByText('1 server')).toBeInTheDocument() // free_value: raw text
      expect(within(row).getByText('Infinite')).toBeVisible()
    })

    it('uses the shared button limits for both plans', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('Server Status - Buttons Limit').closest('tr')!
      expect(within(row).getByText('3 buttons')).toBeInTheDocument()
      expect(within(row).getByText('25 buttons')).toBeInTheDocument()
    })

    it('uses the shared history window instead of a conflicting duration', () => {
      renderWithProviders(() => <Premium />)
      const row = screen.getByText('Game logs in the dashboard').closest('tr')!
      expect(within(row).getByText('Latest 500 entries')).toBeInTheDocument()
      expect(within(row).getByText('Infinite')).toBeVisible()
    })

    it('wraps an in-development feature name in a warning tooltip instead of rendering it plainly', () => {
      renderWithProviders(() => <Premium />)
      const name = screen.getByText('Team voice channels')
      const tooltip = name.closest('[data-tip]')!
      expect(tooltip).toHaveClass('tooltip-warning')
      expect(tooltip.querySelector('svg[data-icon="triangle-alert"]')).toBeInTheDocument()
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
      expect(screen.getByText('What does Premium add?')).toBeInTheDocument()
      expect(screen.getByText('What does In development mean?')).toBeInTheDocument()
    })
  })
})
