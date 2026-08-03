import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import Terms from '../../../src/pages/legal/Terms.js'

afterEach(() => cleanup())

describe('pages/legal/Terms.tsx', () => {
  it('renders the title and every numbered section', () => {
    renderWithProviders(() => <Terms />)
    expect(screen.getByText('Terms of Service')).toBeInTheDocument()
    expect(screen.getByText('1. Introduction')).toBeInTheDocument()
    expect(screen.getByText('9. Modifications to the Terms of Service')).toBeInTheDocument()
  })

  it('linkifies the email address found in the GDPR section content', () => {
    renderWithProviders(() => <Terms />)
    const mailLink = screen.getByText('contact@gmod-integration.com')
    expect(mailLink).toHaveAttribute('href', 'mailto:contact@gmod-integration.com')
  })
})
