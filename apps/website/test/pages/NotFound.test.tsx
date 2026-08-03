import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import { setRedirecting } from '../../src/middleware/redirection.js'
import NotFound from '../../src/pages/NotFound.js'

afterEach(() => cleanup())

describe('pages/NotFound.tsx', () => {
  it('renders a 404 message when not redirecting', () => {
    setRedirecting('')
    renderWithProviders(() => <NotFound />)
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('The page you are looking for does not exist.')).toBeInTheDocument()
  })

  it('renders a redirecting message with a link to the target when redirecting', () => {
    setRedirecting('/legal/privacy')
    renderWithProviders(() => <NotFound />)
    expect(screen.getByText('Redirecting...')).toBeInTheDocument()
    const link = screen.getByText('Click here if you are not redirected.')
    expect(link).toHaveAttribute('href', '/legal/privacy')
    setRedirecting('')
  })
})
