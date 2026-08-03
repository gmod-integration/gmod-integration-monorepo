import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../../../../testUtils.js'
import ServerStatusCustom from '../../../../../../src/pages/dashboard/guilds/servers/status/ServerStatusCustom.js'

afterEach(() => cleanup())

describe('pages/dashboard/guilds/servers/status/ServerStatusCustom.tsx', () => {
  it('renders the panel title, description and the New badge', () => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: true }))
    renderWithProviders(() => <ServerStatusCustom />)
    expect(screen.getByText('Player Custom')).toBeInTheDocument()
    expect(
      screen.getByText('Add {custom} rules to the player list to show custom information like :emoji: ect.'),
    ).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('shows the premium upsell when the guild is not premium', () => {
    window.localStorage.clear()
    window.localStorage.setItem('guilds', JSON.stringify({ id: 'g1', isPremium: false }))
    renderWithProviders(() => <ServerStatusCustom />)
    expect(screen.getByText('This feature is only available to premium users.')).toBeInTheDocument()
  })
})
