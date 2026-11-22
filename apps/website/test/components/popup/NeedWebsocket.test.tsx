import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { NeedWebsocket } from '../../../src/components/popup/NeedWebsocket.js'

afterEach(() => cleanup())

describe('components/popup/NeedWebsocket.tsx', () => {
  it('explains the mandatory server dependency and installation without claiming it is missing', () => {
    renderWithProviders(() => <NeedWebsocket />)
    const link = screen.getByRole('link', { name: 'GWSockets' })
    expect(link).toHaveAttribute('href', 'https://docs.gmod-integration.com/getting-started/installation#dll')
    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('GWSockets is required')
    expect(notice).toHaveTextContent('garrysmod/lua/bin')
    expect(notice).toHaveTextContent('operating system and architecture, then restart the server')
    expect(notice).toHaveTextContent('none of its game integrations work')
    expect(notice).toHaveTextContent('Local addon configuration remains available')
    expect(notice).not.toHaveTextContent(/is missing|not installed/)
  })
})
