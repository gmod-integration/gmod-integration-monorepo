import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { SteamID64 } from '../../src/components/SteamID64.js'

afterEach(() => cleanup())

describe('components/SteamID64.tsx', () => {
  it('renders a link to the steam profile with the id as text', () => {
    render(() => <SteamID64 steamID64="76561198000000000" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://steamcommunity.com/profiles/76561198000000000')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveTextContent('76561198000000000')
  })
})
