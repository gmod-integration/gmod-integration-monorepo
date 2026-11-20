import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { useI18n } from '../../../src/i18n.js'
import Terms from '../../../src/pages/legal/Terms.js'

afterEach(() => {
  cleanup()
  localStorage.removeItem('locale')
})

describe('pages/legal/Terms.tsx', () => {
  it('shows English terms, a machine-readable revision date and working contact/privacy links', () => {
    localStorage.setItem('locale', 'en')
    renderWithProviders(() => <Terms />)

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en')
    expect(screen.getByText('20 November 2026')).toHaveAttribute('datetime', '2026-11-20')
    expect(screen.getByRole('link', { name: 'gmod-integration@linv.dev' })).toHaveAttribute(
      'href',
      'mailto:gmod-integration@linv.dev',
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/legal/privacy')
    expect(screen.getByRole('link', { name: 'Account and sessions' })).toHaveAttribute('href', '/account')
  })

  it('updates the legal document when the user switches to French', () => {
    localStorage.setItem('locale', 'en')
    const Page = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <button onClick={() => updateLocale('fr')}>Français</button>
          <Terms />
        </>
      )
    }
    renderWithProviders(Page)
    fireEvent.click(screen.getByRole('button', { name: 'Français' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Conditions d’utilisation' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'fr')
    expect(screen.getByText('20 novembre 2026')).toHaveAttribute('datetime', '2026-11-20')
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute('href', '/legal/privacy')
    expect(screen.queryByRole('heading', { level: 1, name: 'Terms of Service' })).not.toBeInTheDocument()
  })
})
