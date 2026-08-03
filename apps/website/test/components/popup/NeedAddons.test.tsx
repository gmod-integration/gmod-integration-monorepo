import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../../testUtils.js'
import { NeedAddon } from '../../../src/components/popup/NeedAddons.js'

afterEach(() => cleanup())

describe('components/popup/NeedAddons.tsx', () => {
  it('renders a link for each addon and the surrounding messaging', () => {
    renderWithProviders(() => (
      <NeedAddon
        addons={[
          { name: 'Addon One', link: '/addons/one' },
          { name: 'Addon Two', link: '/addons/two' },
        ]}
      />
    ))
    const linkOne = screen.getByRole('link', { name: 'Addon One' })
    const linkTwo = screen.getByRole('link', { name: 'Addon Two' })
    expect(linkOne).toHaveAttribute('href', '/addons/one')
    expect(linkTwo).toHaveAttribute('href', '/addons/two')
    expect(screen.getByText(/To use this feature you need to install the addon\(s\):/)).toBeInTheDocument()
    expect(screen.getByText(/to work properly\./)).toBeInTheDocument()
  })

  it('renders no links when addons is empty', () => {
    renderWithProviders(() => <NeedAddon addons={[]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
