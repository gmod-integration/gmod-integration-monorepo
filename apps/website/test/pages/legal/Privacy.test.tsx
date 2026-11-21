import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { useI18n } from '../../../src/i18n.js'
import Privacy from '../../../src/pages/legal/Privacy.js'

afterEach(() => {
  cleanup()
  localStorage.removeItem('locale')
})

describe('pages/legal/Privacy.tsx', () => {
  it('falls back to English and provides dated, accessible data tables and rights links', () => {
    localStorage.setItem('locale', 'de')
    renderWithProviders(() => <Privacy />)

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en')
    expect(screen.getByText('21 November 2026')).toHaveAttribute('datetime', '2026-11-21')
    expect(screen.getByRole('table', { name: 'Data processed according to the features used' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Retention criteria and access limits' })).toBeInTheDocument()
    screen.getAllByRole('columnheader').forEach((heading) => expect(heading).toHaveAttribute('scope', 'col'))
    expect(screen.getByRole('link', { name: 'Account — Manage Data' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('link', { name: 'Make a complaint to the CNIL' })).toHaveAttribute(
      'href',
      'https://www.cnil.fr/fr/adresser-une-plainte',
    )
    screen
      .getAllByRole('link', { name: 'gmod-integration@linv.dev' })
      .forEach((link) => expect(link).toHaveAttribute('href', 'mailto:gmod-integration@linv.dev'))
  })

  it('loads French and updates both the document and tables when the language changes', () => {
    localStorage.setItem('locale', 'fr')
    const Page = () => {
      const { updateLocale } = useI18n()
      return (
        <>
          <button onClick={() => updateLocale('en')}>English</button>
          <Privacy />
        </>
      )
    }
    renderWithProviders(Page)

    expect(screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'fr')
    expect(screen.getByText('21 novembre 2026')).toHaveAttribute('datetime', '2026-11-21')
    expect(screen.getByRole('table', { name: 'Critères de conservation et limites d’accès' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute('href', '/legal/terms')

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('table', { name: 'Retention criteria and access limits' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Critères de conservation et limites d’accès' })).not.toBeInTheDocument()
  })
})
