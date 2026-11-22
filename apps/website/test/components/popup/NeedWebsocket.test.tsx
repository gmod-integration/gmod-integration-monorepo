import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { NeedWebsocket } from '../../../src/components/popup/NeedWebsocket.js'

afterEach(() => cleanup())

describe('components/popup/NeedWebsocket.tsx', () => {
  it('renders the GWSocket link and messaging', () => {
    renderWithProviders(() => <NeedWebsocket />)
    const link = screen.getByRole('link', { name: 'GWSockets' })
    expect(link).toHaveAttribute('href', 'https://docs.gmod-integration.com/getting-started/installation#dll')
    expect(screen.getByText(/Install the/)).toBeInTheDocument()
    expect(screen.getByText(/check that the addon is connected/)).toBeInTheDocument()
  })
})
