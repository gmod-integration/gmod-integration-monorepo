import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import ToDo from '../../src/pages/ToDo.js'

afterEach(() => cleanup())

describe('pages/ToDo.tsx', () => {
  it('renders the to-do placeholder title and description', () => {
    renderWithProviders(() => <ToDo />)
    expect(screen.getByText('Feature in development')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This feature is not available yet. Return to the dashboard to use the features already supported.',
      ),
    ).toBeInTheDocument()
  })
})
