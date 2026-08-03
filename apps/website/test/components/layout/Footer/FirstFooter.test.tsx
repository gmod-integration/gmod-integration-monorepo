import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import FirstFooter from '../../../../src/components/layout/Footer/FirstFooter.js'

afterEach(() => cleanup())

describe('components/layout/Footer/FirstFooter.tsx', () => {
  it('renders every footer category and link with the correct hrefs', () => {
    renderWithProviders(() => <FirstFooter />)

    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Resources')).toBeInTheDocument()
    expect(screen.getByText('Legal')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Servers Ranking' })).toHaveAttribute('href', '/servers')
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/docs')
    expect(screen.getByRole('link', { name: 'Premium' })).toHaveAttribute('href', '/premium')
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/legal/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/legal/privacy')
  })
})
