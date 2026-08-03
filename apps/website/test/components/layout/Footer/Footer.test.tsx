import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../testUtils.js'
import { Footer } from '../../../../src/components/layout/Footer/Footer.js'

afterEach(() => cleanup())

describe('components/layout/Footer/Footer.tsx', () => {
  it('renders both FirstFooter and SecondFooter content', () => {
    renderWithProviders(() => <Footer />)
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Gmod Integration')).toBeInTheDocument()
  })
})
