import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import Privacy from '../../../src/pages/legal/Privacy.js'

afterEach(() => cleanup())

describe('pages/legal/Privacy.tsx', () => {
  it('renders the title and every numbered section', () => {
    renderWithProviders(() => <Privacy />)
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
    expect(screen.getByText('1. Introduction')).toBeInTheDocument()
    expect(screen.getByText('7. Amendments to the Privacy Policy')).toBeInTheDocument()
  })

  it('renders numbered sub-sections with a data table for sub-entries that have one', () => {
    renderWithProviders(() => <Privacy />)
    expect(screen.getByText('2.1. Data Collected from Discord')).toBeInTheDocument()
    expect(screen.getByText('Discord User ID')).toBeInTheDocument()
    expect(screen.getAllByText('Type of Data').length).toBeGreaterThan(0)
  })

  it('renders a sub-entry without a table using linkified content instead', () => {
    renderWithProviders(() => <Privacy />)
    // "Log Data" sub-entry has content but no table.
    expect(screen.getByText('2.4. Log Data')).toBeInTheDocument()
  })

  it('linkifies email addresses in section content', () => {
    renderWithProviders(() => <Privacy />)
    const mailLinks = screen.getAllByText('contact@gmod-integration.com')
    expect(mailLinks.length).toBeGreaterThan(0)
    mailLinks.forEach((link) => expect(link).toHaveAttribute('href', 'mailto:contact@gmod-integration.com'))
  })
})
