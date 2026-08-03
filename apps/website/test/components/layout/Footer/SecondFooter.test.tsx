import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import SecondFooter from '../../../../src/components/layout/Footer/SecondFooter.js'

afterEach(() => cleanup())

describe('components/layout/Footer/SecondFooter.tsx', () => {
  it('renders the brand, disclaimer, and last build date derived from __BUILD_DATE__', () => {
    renderWithProviders(() => <SecondFooter />)
    expect(screen.getByText('Gmod Integration')).toBeInTheDocument()
    expect(
      screen.getByText('This service is not affiliated with Discord, Steam, or any other platform or games.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Last build date:/)).toBeInTheDocument()
  })
})
